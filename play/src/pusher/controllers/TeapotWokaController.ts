import type { Application, Request, Response } from "express";
import express from "express";
import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import { z } from "zod";

import { TEAPOT_WOKA_CATEGORIES } from "../../common/Teapot/TeapotWoka";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { teapotAuthoringGate } from "../middlewares/TeapotAuthoringMiddleware";
import { TeapotAuthorizationError, TeapotDataConflictError, TeapotDataNotFoundError } from "../teapot/TeapotDataErrors";
import type { TeapotWokaService } from "../teapot/TeapotWokaService";
import { MAX_WOKA_FILE_BYTES, TeapotWokaValidationError } from "../teapot/TeapotWokaPngValidator";
import { validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const uploadQuery = z.object({
    name: z.string().min(1).max(80),
    category: z.enum(TEAPOT_WOKA_CATEGORIES).default("woka"),
});
const textureParams = z.object({ textureId: z.string().min(1).max(160) });
const assetParams = z.object({ assetId: z.string().min(1).max(128) });

export class TeapotWokaController extends BaseHttpController {
    constructor(
        app: Application,
        private readonly service: TeapotWokaService,
    ) {
        super(app);
    }

    protected routes(): void {
        this.app.get("/teapot/woka-assets/:assetId.png", async (req: Request, res: Response) => {
            const params = assetParams.safeParse(req.params);
            if (!params.success) {
                res.status(404).send("Not found");
                return;
            }
            try {
                const raster = await this.service.getPublicRaster(params.data.assetId);
                if (raster === null) {
                    res.status(404).send("Not found");
                    return;
                }
                const etag = `"${raster.etag.replace(/[^A-Za-z0-9_-]/g, "")}"`;
                res.set({
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Content-Disposition": "inline",
                    "Content-Security-Policy": "default-src 'none'; sandbox",
                    "Cross-Origin-Resource-Policy": "cross-origin",
                    ETag: etag,
                    "X-Content-Type-Options": "nosniff",
                });
                if (req.header("if-none-match") === etag) {
                    res.status(304).send();
                    return;
                }
                res.status(200).type("png").send(raster.bytes);
            } catch (error: unknown) {
                sendTeapotWokaError(res, error);
            }
        });

        this.app.get(
            "/teapot/wokas",
            [authenticated, teapotAuthoringGate],
            async (_req: Request, res: ResponseWithUserIdentifier) => {
                const providerSubject = requireProviderSubject(res);
                if (providerSubject === null) return;
                try {
                    res.set("Cache-Control", "private, no-store");
                    res.status(200).json(await this.service.list(providerSubject));
                } catch (error: unknown) {
                    sendTeapotWokaError(res, error);
                }
            },
        );

        this.app.post(
            "/teapot/wokas",
            [authenticated, teapotAuthoringGate, express.raw({ type: "image/png", limit: MAX_WOKA_FILE_BYTES })],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const providerSubject = requireProviderSubject(res);
                if (providerSubject === null) return;
                const query = validateQuery(req, res, uploadQuery);
                if (query === undefined) return;
                if (!Buffer.isBuffer(req.body)) {
                    res.status(415).json({ error: "Expected an image/png request body" });
                    return;
                }
                try {
                    res.status(201).json(
                        await this.service.accept(providerSubject, query.name, req.body, query.category),
                    );
                } catch (error: unknown) {
                    sendTeapotWokaError(res, error);
                }
            },
        );

        this.app.put(
            "/teapot/wokas/:textureId/select",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const providerSubject = requireProviderSubject(res);
                if (providerSubject === null) return;
                const params = textureParams.safeParse(req.params);
                if (!params.success) {
                    res.status(404).json({ error: "Generated Woka not found" });
                    return;
                }
                try {
                    res.status(200).json(await this.service.select(providerSubject, params.data.textureId));
                } catch (error: unknown) {
                    sendTeapotWokaError(res, error);
                }
            },
        );

        this.app.delete(
            "/teapot/wokas/:textureId",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const providerSubject = requireProviderSubject(res);
                if (providerSubject === null) return;
                const params = textureParams.safeParse(req.params);
                if (!params.success) {
                    res.status(404).json({ error: "Generated Woka not found" });
                    return;
                }
                try {
                    await this.service.delete(providerSubject, params.data.textureId);
                    res.status(204).send();
                } catch (error: unknown) {
                    sendTeapotWokaError(res, error);
                }
            },
        );
    }
}

function requireProviderSubject(res: ResponseWithUserIdentifier): string | null {
    if (res.userIdentifier === undefined || res.userIdentifier.length === 0) {
        res.status(401).json({ error: "Authenticated user identifier is missing" });
        return null;
    }
    return res.userIdentifier;
}

function sendTeapotWokaError(res: Response, error: unknown): void {
    const cause = asError(error);
    if (cause instanceof TeapotWokaValidationError) {
        res.status(422).json({ error: cause.message });
        return;
    }
    if (cause instanceof TeapotDataNotFoundError) {
        res.status(404).json({ error: cause.message });
        return;
    }
    if (cause instanceof TeapotAuthorizationError) {
        res.status(403).json({ error: "This account cannot manage generated Wokas" });
        return;
    }
    if (cause instanceof TeapotDataConflictError) {
        res.status(409).json({ error: cause.message });
        return;
    }
    console.error("Generated Woka request failed", cause);
    Sentry.captureException(cause);
    res.status(500).json({ error: "Generated Woka request failed" });
}
