// @vitest-environment node

import type { Application, Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { TeapotAdmissionController } from "../../src/pusher/controllers/TeapotAdmissionController";
import type { JWTTokenManager } from "../../src/pusher/services/JWTTokenManager";
import type { TeapotAdmissionService } from "../../src/pusher/teapot/TeapotAdmissionService";
import type { TeapotXOAuthService } from "../../src/pusher/teapot/TeapotXOAuthService";
import type { TeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";

class RouteRecordingApp {
    readonly getRoutes = new Map<string, RequestHandler>();

    get(path: string, ...handlers: RequestHandler[]): this {
        const handler = handlers.at(-1);
        if (handler !== undefined) this.getRoutes.set(path, handler);
        return this;
    }

    post(): this {
        return this;
    }
}

class CallbackResponse {
    readonly clearCookie = vi.fn();
    readonly setHeader = vi.fn();
    readonly json = vi.fn();
    readonly locals = {};
    statusCode = 200;

    status(statusCode: number): this {
        this.statusCode = statusCode;
        return this;
    }
}

function createController(app: RouteRecordingApp): void {
    new TeapotAdmissionController(
        app as unknown as Application,
        {} as JWTTokenManager,
        {} as TeapotDataServices,
        { isConfigured: () => true } as unknown as TeapotXOAuthService,
        {} as TeapotAdmissionService,
    );
}

async function invokeCallback(app: RouteRecordingApp, request: object, response: CallbackResponse): Promise<void> {
    const handler = app.getRoutes.get("/teapot/auth/x/callback");
    if (handler === undefined) throw new Error("X OAuth callback route was not registered");
    await handler(request as Request, response as unknown as Response, vi.fn());
}

describe("TeapotAdmissionController X callback", () => {
    it("returns Retry-After when an IP exceeds the callback limit", async () => {
        const app = new RouteRecordingApp();
        createController(app);

        for (let attempt = 0; attempt < 30; attempt += 1) {
            // eslint-disable-next-line no-await-in-loop -- requests must be sequential to exercise the rolling limiter
            await invokeCallback(app, { cookies: {}, ip: "127.0.0.3", query: {} }, new CallbackResponse());
        }
        const limitedResponse = new CallbackResponse();
        await invokeCallback(app, { cookies: {}, ip: "127.0.0.3", query: {} }, limitedResponse);

        expect(limitedResponse.statusCode).toBe(429);
        expect(limitedResponse.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
        const retryAfter = limitedResponse.setHeader.mock.calls.find(([name]) => name === "Retry-After")?.[1];
        expect(Number(retryAfter)).toBeGreaterThan(0);
        expect(limitedResponse.json).toHaveBeenCalledWith({ error: "rate_limited" });
    });

    it("clears the browser state cookie before rejecting a malformed callback", async () => {
        const app = new RouteRecordingApp();
        const response = new CallbackResponse();
        createController(app);

        await invokeCallback(
            app,
            {
                cookies: { teapot_x_oauth_state: "browser-state" },
                ip: "127.0.0.1",
                query: {},
            },
            response,
        );

        expect(response.clearCookie).toHaveBeenCalledWith("teapot_x_oauth_state", {
            path: "/teapot/auth/x/callback",
        });
        expect(response.statusCode).toBe(400);
        expect(response.json).toHaveBeenCalledWith({ error: "invalid_oauth_callback" });
    });

    it("clears the browser state cookie before rejecting a state mismatch", async () => {
        const app = new RouteRecordingApp();
        const response = new CallbackResponse();
        createController(app);

        await invokeCallback(
            app,
            {
                cookies: { teapot_x_oauth_state: "different-browser-state" },
                ip: "127.0.0.2",
                query: { code: "oauth-code", state: "callback-state-that-is-long-enough" },
            },
            response,
        );

        expect(response.clearCookie).toHaveBeenCalledOnce();
        expect(response.statusCode).toBe(401);
        expect(response.json).toHaveBeenCalledWith({ error: "x_auth_failed" });
    });
});
