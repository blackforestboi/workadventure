// @vitest-environment node

import type { Application, Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/enums/EnvironmentVariable", async () => ({
    ...(await import("./mocks/pusherEnvironmentVariableMock")),
    TEAPOT_X_CLIENT_ID: "x-client",
    TEAPOT_X_REDIRECT_URI: "http://pusher.test/teapot/auth/x/callback",
}));

vi.mock("../../src/pusher/services/AdminService", () => ({
    adminService: { getCapabilities: vi.fn().mockResolvedValue({}) },
}));

vi.mock("../../src/pusher/services/LoginProvider", () => ({
    selectLoginProvider: vi.fn(() => "x"),
}));

vi.mock("../../src/pusher/services/MatrixProvider", () => ({
    matrixProvider: { getBareMatrixIdFromEmail: vi.fn() },
}));

vi.mock("../../src/pusher/services/verifyDomain/VerifyDomainService", () => ({
    VerifyDomainService: {
        get: vi.fn(() => ({ verifyDomain: vi.fn().mockResolvedValue(true) })),
    },
}));

import { AuthenticateController } from "../../src/pusher/controllers/AuthenticateController";

class RouteRecordingApp {
    readonly getRoutes = new Map<string, RequestHandler>();

    get(path: string, ...handlers: RequestHandler[]): this {
        const handler = handlers.at(-1);
        if (handler !== undefined) this.getRoutes.set(path, handler);
        return this;
    }

    options(): this {
        return this;
    }

    post(): this {
        return this;
    }
}

class RecordingResponse {
    readonly cookie = vi.fn();
    readonly redirect = vi.fn();
    readonly send = vi.fn();
    readonly status = vi.fn(() => this);
}

describe("AuthenticateController", () => {
    it("persists playUri before redirecting to X sign-in", async () => {
        const app = new RouteRecordingApp();
        const response = new RecordingResponse();
        new AuthenticateController(app as unknown as Application);

        const handler = app.getRoutes.get("/login-screen");
        if (handler === undefined) throw new Error("Login route was not registered");

        await handler(
            {
                ip: "127.0.0.1",
                method: "GET",
                originalUrl: "/login-screen?playUri=https%3A%2F%2Fplay.workadventure.localhost%2F_example",
                query: { playUri: "https://play.workadventure.localhost/_example" },
                secure: false,
            } as unknown as Request,
            response as unknown as Response,
            vi.fn(),
        );

        expect(response.cookie).toHaveBeenCalledWith("playUri", "https://play.workadventure.localhost/_example", {
            httpOnly: true,
            secure: false,
        });
        expect(response.redirect).toHaveBeenCalledWith(
            expect.stringContaining(
                "/teapot/auth/x/start?returnTo=https%3A%2F%2Fplay.workadventure.localhost%2F_example",
            ),
        );
    });
});
