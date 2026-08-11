import type { Application, NextFunction, Response } from "express";
import { z } from "zod";

import {
    TeapotAdmissionConflictError,
    TeapotAdmissionTokenError,
    TeapotAuthorizationError,
    TeapotDataConflictError,
    TeapotDataNotFoundError,
    TeapotOAuthError,
} from "../teapot/TeapotDataErrors";
import type { TeapotAdmissionService } from "../teapot/TeapotAdmissionService";
import type { TeapotXOAuthService } from "../teapot/TeapotXOAuthService";
import { createTeapotAuthenticatedMiddleware } from "../middlewares/TeapotAdmissionMiddleware";
import type { TeapotDataServices } from "../teapot/createTeapotDataServices";
import type { JWTTokenManager } from "../services/JWTTokenManager";
import { opaqueTokensEqual } from "../teapot/TeapotTokenSecurity";
import { TeapotRateLimiter } from "../teapot/TeapotRateLimiter";

const StartQuery = z.object({ returnTo: z.string().max(2_048).optional() });
const CallbackQuery = z.object({ code: z.string().min(1).max(2_048), state: z.string().min(20).max(256) });
const PendingBody = z.object({ shareToken: z.string().min(20).max(256) });
const ConfirmBody = z.object({ confirmationToken: z.string().min(20).max(256) });

const X_OAUTH_STATE_COOKIE = "teapot_x_oauth_state";
const X_OAUTH_STATE_COOKIE_PATH = "/teapot/auth/x/callback";

export class TeapotAdmissionController {
    private readonly oauthRateLimiter = new TeapotRateLimiter(30, 60_000);
    private readonly admissionRateLimiter = new TeapotRateLimiter(60, 10 * 60_000);

    constructor(
        private readonly app: Application,
        private readonly jwtTokenManager: JWTTokenManager,
        private readonly dataServices: TeapotDataServices,
        private readonly oauth: TeapotXOAuthService,
        private readonly admission: TeapotAdmissionService,
    ) {
        this.routes();
    }

    private routes(): void {
        const authenticated = createTeapotAuthenticatedMiddleware(this.jwtTokenManager, this.dataServices);

        this.app.get("/teapot/auth/x/config", (_req, res) => {
            this.noStore(res);
            res.json({ enabled: this.oauth.isConfigured() });
        });

        this.app.get("/teapot/auth/x/start", async (req, res, next) => {
            this.noStore(res);
            if (!this.allowRequest(this.oauthRateLimiter, `start:${req.ip}`, res)) return;
            const query = StartQuery.safeParse(req.query);
            if (!query.success) {
                res.status(400).json({ error: "invalid_request" });
                return;
            }
            try {
                const authorizationUrl = await this.oauth.begin(query.data.returnTo);
                const state = new URL(authorizationUrl).searchParams.get("state");
                if (state === null) throw new TeapotOAuthError("X sign-in did not create state");
                res.cookie(X_OAUTH_STATE_COOKIE, state, {
                    httpOnly: true,
                    sameSite: "lax",
                    secure: req.secure || req.header("x-forwarded-proto") === "https",
                    path: X_OAUTH_STATE_COOKIE_PATH,
                    maxAge: 5 * 60 * 1_000,
                });
                res.redirect(authorizationUrl);
            } catch (error) {
                this.handleError(error, res, next);
            }
        });

        this.app.get("/teapot/auth/x/callback", async (req, res, next) => {
            this.noStore(res);
            if (!this.allowRequest(this.oauthRateLimiter, `callback:${req.ip}`, res)) return;
            const cookieState = req.cookies[X_OAUTH_STATE_COOKIE] as unknown;
            res.clearCookie(X_OAUTH_STATE_COOKIE, { path: X_OAUTH_STATE_COOKIE_PATH });
            const query = CallbackQuery.safeParse(req.query);
            if (!query.success) {
                res.status(400).json({ error: "invalid_oauth_callback" });
                return;
            }
            try {
                if (typeof cookieState !== "string" || !opaqueTokensEqual(cookieState, query.data.state)) {
                    throw new TeapotOAuthError("X sign-in browser state is invalid or expired");
                }
                const result = await this.oauth.complete(query.data.code, query.data.state);
                res.redirect(result.redirectTo);
            } catch (error) {
                this.handleError(error, res, next);
            }
        });

        this.app.get("/teapot/admission/status", authenticated, async (_req, res, next) => {
            this.noStore(res);
            try {
                res.json(await this.admission.getStatus(res.locals.teapotIdentity.id));
            } catch (error) {
                this.handleError(error, res, next);
            }
        });

        this.app.post("/teapot/admission/share", authenticated, async (_req, res, next) => {
            this.noStore(res);
            if (!this.allowAdmissionMutation("share", res)) return;
            try {
                res.status(201).json(await this.admission.createShareLink(res.locals.teapotIdentity.id));
            } catch (error) {
                this.handleError(error, res, next);
            }
        });

        this.app.post("/teapot/admission/pending", authenticated, async (req, res, next) => {
            this.noStore(res);
            if (!this.allowAdmissionMutation("pending", res)) return;
            const body = PendingBody.safeParse(req.body);
            if (!body.success) {
                res.status(400).json({ error: "invalid_request" });
                return;
            }
            try {
                res.status(201).json(
                    await this.admission.createPendingEndorsement(res.locals.teapotIdentity.id, body.data.shareToken),
                );
            } catch (error) {
                this.handleError(error, res, next);
            }
        });

        this.app.post("/teapot/admission/confirm", authenticated, async (req, res, next) => {
            this.noStore(res);
            if (!this.allowAdmissionMutation("confirm", res)) return;
            const body = ConfirmBody.safeParse(req.body);
            if (!body.success) {
                res.status(400).json({ error: "invalid_request" });
                return;
            }
            try {
                res.json(
                    await this.admission.confirmEndorsement(res.locals.teapotIdentity.id, body.data.confirmationToken),
                );
            } catch (error) {
                this.handleError(error, res, next);
            }
        });
    }

    private noStore(res: Response): void {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
    }

    private allowAdmissionMutation(action: string, res: Response): boolean {
        return this.allowRequest(this.admissionRateLimiter, `${action}:${res.locals.teapotIdentity.id}`, res);
    }

    private allowRequest(limiter: TeapotRateLimiter, key: string, res: Response): boolean {
        const result = limiter.consume(key);
        if (result.allowed) return true;
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
        res.status(429).json({ error: "rate_limited" });
        return false;
    }

    private handleError(error: unknown, res: Response, next: NextFunction): void {
        if (error instanceof TeapotOAuthError) {
            const unavailable = error.message.includes("not configured");
            res.status(unavailable ? 503 : 401).json({ error: unavailable ? "x_auth_unavailable" : "x_auth_failed" });
            return;
        }
        if (error instanceof TeapotAdmissionTokenError) {
            res.status(401).json({ error: "invalid_or_expired_token" });
            return;
        }
        if (error instanceof TeapotAdmissionConflictError || error instanceof TeapotDataConflictError) {
            res.status(409).json({ error: "admission_conflict", message: error.message });
            return;
        }
        if (error instanceof TeapotAuthorizationError) {
            res.status(403).json({ error: "not_allowed" });
            return;
        }
        if (error instanceof TeapotDataNotFoundError) {
            res.status(404).json({ error: "not_found" });
            return;
        }
        next(error);
    }
}
