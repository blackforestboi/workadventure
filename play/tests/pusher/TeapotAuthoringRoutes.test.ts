// @vitest-environment node

import type { Application, Request, RequestHandler, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ authenticated: vi.fn() }));
const authoringMocks = vi.hoisted(() => ({
    teapotAuthoringGate: vi.fn(),
    assertTeapotMcpSessionAuthoringAccess: vi.fn(() => Promise.resolve()),
    sendTeapotAuthoringAccessError: vi.fn(() => false),
}));
const mcpMocks = vi.hoisted(() => ({
    authenticateToken: vi.fn(),
    capabilities: vi.fn(() => ({})),
}));

vi.mock("../../src/pusher/middlewares/Authenticated", () => authMocks);
vi.mock("../../src/pusher/middlewares/TeapotAuthoringMiddleware", () => authoringMocks);
vi.mock("../../src/pusher/enums/EnvironmentVariable", () => ({
    MAP_EDITOR_ALLOW_ALL_USERS: false,
    TEAPOT_REQUIRE_PERSISTENCE: false,
    TEAPOT_WOKA_STORAGE_DIRECTORY: "/tmp/teapot-authoring-route-test",
}));
vi.mock("../../src/pusher/services/AdminService", () => ({
    adminService: { fetchMemberDataByUuid: vi.fn() },
}));
vi.mock("../../src/pusher/teapot/TeapotDataRuntime", () => ({
    getTeapotDataRuntimeStatus: () => ({ initialized: true, durable: false }),
    getTeapotDataServices: vi.fn(),
}));
vi.mock("../../src/pusher/teapot/TeapotMapPublicationService", () => ({
    TeapotMapPublicationError: class extends Error {},
    teapotMapPublicationService: {},
}));
vi.mock("../../src/pusher/teapot/TeapotMcpAuthoringService", () => ({
    TeapotMcpAuthoringError: class extends Error {},
    teapotMcpAuthoringService: mcpMocks,
}));
vi.mock("../../src/pusher/teapot/TeapotRequestIdentityResolver", () => ({
    resolveTeapotRequestIdentity: vi.fn(),
}));

import { authenticated } from "../../src/pusher/middlewares/Authenticated";
import {
    assertTeapotMcpSessionAuthoringAccess,
    teapotAuthoringGate,
} from "../../src/pusher/middlewares/TeapotAuthoringMiddleware";
import { TeapotGeneratedAssetController } from "../../src/pusher/controllers/TeapotGeneratedAssetController";
import { TeapotHealthController } from "../../src/pusher/controllers/TeapotHealthController";
import { TeapotMapController } from "../../src/pusher/controllers/TeapotMapController";
import { TeapotRoomEditorAccessController } from "../../src/pusher/controllers/TeapotRoomEditorAccessController";
import { TeapotMcpController } from "../../src/pusher/controllers/TeapotMcpController";
import { TeapotTilesetController } from "../../src/pusher/controllers/TeapotTilesetController";
import { TeapotWokaController } from "../../src/pusher/controllers/TeapotWokaController";
import { TeapotAiProviderController } from "../../src/pusher/controllers/TeapotAiProviderController";
import type { TeapotAgentBridgeClient } from "../../src/pusher/teapot/TeapotAgentBridgeClient";
import type { TeapotGeneratedAssetService } from "../../src/pusher/teapot/TeapotGeneratedAssetService";
import type { TeapotTilesetService } from "../../src/pusher/teapot/TeapotTilesetService";
import type { TeapotWokaService } from "../../src/pusher/teapot/TeapotWokaService";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

class RouteRecordingApp {
    readonly routes = new Map<string, unknown[]>();

    get(path: string, ...handlers: unknown[]): this {
        return this.record("GET", path, handlers);
    }

    post(path: string, ...handlers: unknown[]): this {
        return this.record("POST", path, handlers);
    }

    put(path: string, ...handlers: unknown[]): this {
        return this.record("PUT", path, handlers);
    }

    delete(path: string, ...handlers: unknown[]): this {
        return this.record("DELETE", path, handlers);
    }

    private record(method: HttpMethod, path: string, handlers: unknown[]): this {
        this.routes.set(`${method} ${path}`, handlers);
        return this;
    }
}

class RecordingResponse {
    readonly json = vi.fn();
    readonly setHeader = vi.fn();
    statusCode = 200;

    status(statusCode: number): this {
        this.statusCode = statusCode;
        return this;
    }
}

function routeMiddleware(app: RouteRecordingApp, method: HttpMethod, path: string): unknown[] {
    const route = app.routes.get(`${method} ${path}`);
    if (route === undefined) throw new Error(`Route ${method} ${path} was not registered`);
    return Array.isArray(route[0]) ? route[0] : [];
}

function expectAuthoringRoute(app: RouteRecordingApp, method: HttpMethod, path: string): void {
    expect(routeMiddleware(app, method, path).slice(0, 2)).toEqual([authenticated, teapotAuthoringGate]);
}

function expectPublicRoute(app: RouteRecordingApp, path: string): void {
    const route = app.routes.get(`GET ${path}`);
    expect(route).toHaveLength(1);
    expect(routeMiddleware(app, "GET", path)).toEqual([]);
}

function expectAuthenticatedRoute(app: RouteRecordingApp, method: HttpMethod, path: string): void {
    const route = app.routes.get(`${method} ${path}`);
    expect(route?.[0]).toBe(authenticated);
}

describe("Teapot authoring route coverage", () => {
    beforeEach(() => vi.clearAllMocks());

    it("gates every browser authoring route while leaving immutable rasters and health public", () => {
        const app = new RouteRecordingApp();
        const application = app as unknown as Application;
        new TeapotMapController(application);
        new TeapotRoomEditorAccessController(application);
        new TeapotWokaController(application, {} as TeapotWokaService);
        new TeapotTilesetController(application, {} as TeapotTilesetService);
        new TeapotGeneratedAssetController(application, {} as TeapotGeneratedAssetService);
        new TeapotAiProviderController(application, {} as TeapotAgentBridgeClient);
        new TeapotMcpController(application);
        new TeapotHealthController(application);

        const authoringRoutes: [HttpMethod, string][] = [
            ["GET", "/teapot/maps/revision"],
            ["POST", "/teapot/maps/publish-tmj"],
            ["GET", "/teapot/wokas"],
            ["POST", "/teapot/wokas"],
            ["PUT", "/teapot/wokas/:textureId/select"],
            ["DELETE", "/teapot/wokas/:textureId"],
            ["GET", "/teapot/tilesets"],
            ["POST", "/teapot/tilesets"],
            ["GET", "/teapot/generated-assets/private/:assetId.png"],
            ["GET", "/teapot/generated-assets"],
            ["POST", "/teapot/generated-assets"],
            ["POST", "/teapot/ai/providers/:provider/oauth/start"],
            ["GET", "/teapot/ai/providers/:provider/oauth/status"],
            ["POST", "/teapot/ai/providers/:provider/oauth/complete"],
            ["DELETE", "/teapot/ai/providers/:provider/connection"],
            ["GET", "/teapot/ai/providers/:provider/models"],
            ["POST", "/teapot/ai/providers/:provider/generate"],
            ["POST", "/teapot/mcp/browser/sessions"],
            ["DELETE", "/teapot/mcp/browser/sessions/:sessionId"],
            ["GET", "/teapot/mcp/browser/proposals"],
            ["GET", "/teapot/mcp/browser/proposals/:proposalId"],
            ["POST", "/teapot/mcp/browser/proposals/:proposalId/approve"],
            ["POST", "/teapot/mcp/browser/proposals/:proposalId/deny"],
            ["POST", "/teapot/mcp/browser/proposals/:proposalId/claim-paid-generation"],
            ["POST", "/teapot/mcp/browser/proposals/:proposalId/complete-paid-generation"],
        ];
        for (const [method, path] of authoringRoutes) expectAuthoringRoute(app, method, path);

        expectAuthenticatedRoute(app, "GET", "/teapot/rooms/editor-access");
        expectAuthenticatedRoute(app, "PUT", "/teapot/rooms/editor-access");

        expectPublicRoute(app, "/teapot/woka-assets/:assetId.png");
        expectPublicRoute(app, "/teapot/tileset-assets/:assetId.png");
        expectPublicRoute(app, "/teapot/generated-assets/:assetId.png");
        expectPublicRoute(app, "/teapot/health/ready");
    });

    it("rechecks the current owner behind direct MCP bearer routes", async () => {
        const app = new RouteRecordingApp();
        new TeapotMcpController(app as unknown as Application);
        mcpMocks.authenticateToken.mockResolvedValue({ ownerId: "x-owner", sessionId: "session-1" });
        const route = app.routes.get("GET /teapot/mcp/session");
        const handler = route?.[0] as RequestHandler | undefined;
        if (handler === undefined) throw new Error("Direct MCP session route was not registered");
        const response = new RecordingResponse();

        await handler(
            { header: () => `Bearer ${"a".repeat(32)}` } as unknown as Request,
            response as unknown as Response,
            vi.fn(),
        );

        expect(assertTeapotMcpSessionAuthoringAccess).toHaveBeenCalledWith("x-owner");
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "x-owner" }));
    });

    it("serves the curated terrain catalog through the direct MCP bearer API", async () => {
        const app = new RouteRecordingApp();
        new TeapotMcpController(app as unknown as Application);
        mcpMocks.authenticateToken.mockResolvedValue({ ownerId: "x-owner", sessionId: "session-1" });
        const route = app.routes.get("GET /teapot/mcp/terrain-catalog");
        const handler = route?.[0] as RequestHandler | undefined;
        if (handler === undefined) throw new Error("Terrain catalog route was not registered");
        const response = new RecordingResponse();

        await handler(
            {
                header: () => `Bearer ${"a".repeat(32)}`,
                query: { query: "river", terrainType: "water", solid: "true", limit: "1" },
            } as unknown as Request,
            response as unknown as Response,
            vi.fn(),
        );

        expect(assertTeapotMcpSessionAuthoringAccess).toHaveBeenCalledWith("x-owner");
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                total: expect.any(Number),
                available: expect.any(Number),
                items: [expect.objectContaining({ terrainType: "water", solid: true })],
            }),
        );
    });

    it("serves all classified non-empty atlas assets through the direct MCP bearer API", async () => {
        const app = new RouteRecordingApp();
        new TeapotMcpController(app as unknown as Application);
        mcpMocks.authenticateToken.mockResolvedValue({ ownerId: "x-owner", sessionId: "session-1" });
        const route = app.routes.get("GET /teapot/mcp/asset-catalog");
        const handler = route?.[0] as RequestHandler | undefined;
        if (handler === undefined) throw new Error("Atlas asset catalog route was not registered");
        const response = new RecordingResponse();

        await handler(
            {
                header: () => `Bearer ${"a".repeat(32)}`,
                query: { query: "wooden bridge", kind: "structure", solid: "true", limit: "1" },
            } as unknown as Request,
            response as unknown as Response,
            vi.fn(),
        );

        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                available: 960,
                terrainAvailable: expect.any(Number),
                items: [expect.objectContaining({ kind: "structure", editorEligible: false })],
            }),
        );
    });
});
