// @vitest-environment node

import type { Application, Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/middlewares/Authenticated", () => ({ authenticated: vi.fn() }));

import { TeapotTilesetController } from "../../src/pusher/controllers/TeapotTilesetController";
import type { TeapotTilesetService } from "../../src/pusher/teapot/TeapotTilesetService";

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

class RecordingResponse {
    readonly headers = new Map<string, string>();
    readonly send = vi.fn();
    readonly json = vi.fn();
    statusCode = 200;

    set(headers: Record<string, string>): this {
        for (const [name, value] of Object.entries(headers)) this.headers.set(name, value);
        return this;
    }

    status(status: number): this {
        this.statusCode = status;
        return this;
    }

    type(contentType: string): this {
        this.headers.set("Content-Type", contentType);
        return this;
    }
}

describe("TeapotTilesetController", () => {
    it("serves opaque published PNGs with immutable cross-origin-safe headers and ETag revalidation", async () => {
        const app = new RouteRecordingApp();
        const service = {
            getPublicRaster: vi.fn(() => Promise.resolve({ bytes: Buffer.from("png"), etag: "digest-1" })),
        } as unknown as TeapotTilesetService;
        new TeapotTilesetController(app as unknown as Application, service);
        const handler = app.getRoutes.get("/teapot/tileset-assets/:assetId.png");
        if (handler === undefined) throw new Error("Public tileset route was not registered");

        const response = new RecordingResponse();
        await handler(
            { params: { assetId: "asset-1" }, header: () => undefined } as unknown as Request,
            response as unknown as Response,
            vi.fn(),
        );

        expect(response.statusCode).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
        expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
        expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
        expect(response.headers.get("ETag")).toBe('"digest-1"');
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.send).toHaveBeenCalledWith(Buffer.from("png"));

        const cachedResponse = new RecordingResponse();
        await handler(
            { params: { assetId: "asset-1" }, header: () => '"digest-1"' } as unknown as Request,
            cachedResponse as unknown as Response,
            vi.fn(),
        );
        expect(cachedResponse.statusCode).toBe(304);
    });
});
