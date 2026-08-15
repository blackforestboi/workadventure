import type { Application, Request, Response } from "express";
import { z } from "zod";

import {
    TEAPOT_MCP_PROPOSAL_STATES,
    TeapotMapPatch,
    TeapotPaidGenerationCompletionResult,
    TeapotPaidGenerationRequest,
} from "@workadventure/teapot-mcp/contracts";

import {
    BUILT_IN_ATLAS_ASSET_KINDS,
    BUILT_IN_ATLAS_ASSETS,
    ALL_BUILT_IN_TERRAIN_ASSETS,
    BUILT_IN_TERRAIN_ASSETS,
    BUILT_IN_TERRAIN_CATALOG_VERSION,
    BUILT_IN_TERRAIN_TILESETS,
    BUILT_IN_TERRAIN_TYPES,
    searchBuiltInAtlasAssets,
    searchBuiltInTerrainAssets,
} from "../../common/Teapot/BuiltInTerrainCatalog";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import {
    assertTeapotMcpSessionAuthoringAccess,
    sendTeapotAuthoringAccessError,
    teapotAuthoringGate,
} from "../middlewares/TeapotAuthoringMiddleware";
import {
    TeapotAuthorizationError,
    TeapotMapRevisionConflictError,
    TeapotMapWriterLeaseConflictError,
} from "../teapot/TeapotDataErrors";
import { TeapotMcpAuthoringError, teapotMcpAuthoringService } from "../teapot/TeapotMcpAuthoringService";
import type { TeapotMcpSessionContext } from "../teapot/TeapotMcpAuthoringService";
import { TeapotMapPublicationError } from "../teapot/TeapotMapPublicationService";
import { resolveTeapotRequestIdentity } from "../teapot/TeapotRequestIdentityResolver";
import { TeapotSemanticPatchError } from "../teapot/TeapotSemanticPatchCompiler";
import { BaseHttpController } from "./BaseHttpController";

const SessionBody = z.object({ clientName: z.string().trim().min(1).max(120) }).strict();
const SessionParams = z.object({ sessionId: z.string().uuid() }).strict();
const ProposalParams = z.object({ proposalId: z.string().uuid() }).strict();
const ProposalListQuery = z
    .object({
        sessionId: z.string().uuid().optional(),
        state: z.enum(TEAPOT_MCP_PROPOSAL_STATES).optional(),
    })
    .strict();
const MapSummaryQuery = z.object({ mapUrl: z.string().url().max(2_048) }).strict();
const UndoBody = z
    .object({
        mapUrl: z.string().url().max(2_048),
        expectedRevision: z.number().int().positive(),
        previousRevisionUrl: z.string().url().max(2_048),
        title: z.string().trim().min(1).max(120),
        rationale: z.string().trim().min(1).max(2_000),
    })
    .strict();
const ApplyBody = z.object({ approvalToken: z.string().min(32).max(2_048) }).strict();
const CompletePaidBody = z
    .object({
        approvalToken: z.string().min(32).max(2_048),
        result: z.unknown(),
    })
    .strict();
const TerrainCatalogQuery = z
    .object({
        query: z.string().trim().max(200).optional(),
        terrainType: z.enum(BUILT_IN_TERRAIN_TYPES).optional(),
        solid: z
            .union([z.literal("true"), z.literal("false")])
            .transform((value) => value === "true")
            .optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
    })
    .strict();
const AssetCatalogQuery = z
    .object({
        query: z.string().trim().max(200).optional(),
        kind: z.enum(BUILT_IN_ATLAS_ASSET_KINDS).optional(),
        terrainType: z.enum(BUILT_IN_TERRAIN_TYPES).optional(),
        solid: z
            .union([z.literal("true"), z.literal("false")])
            .transform((value) => value === "true")
            .optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
    })
    .strict();

export class TeapotMcpController extends BaseHttpController {
    constructor(app: Application) {
        super(app);
    }

    protected routes(): void {
        this.browserRoutes();
        this.mcpRoutes();
    }

    private browserRoutes(): void {
        this.app.post(
            "/teapot/mcp/browser/sessions",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const body = SessionBody.safeParse(req.body);
                if (!body.success) {
                    res.status(400).json({ error: "Invalid request" });
                    return;
                }
                await this.withBrowserIdentity(res, true, async (ownerId) => {
                    res.status(201).json(await teapotMcpAuthoringService.createSession(ownerId, body.data.clientName));
                });
            },
        );

        this.app.delete(
            "/teapot/mcp/browser/sessions/:sessionId",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const params = SessionParams.safeParse(req.params);
                if (!params.success) {
                    res.status(400).json({ error: "Invalid request" });
                    return;
                }
                await this.withBrowserIdentity(res, true, async (ownerId) => {
                    await teapotMcpAuthoringService.revokeSession(ownerId, params.data.sessionId);
                    res.status(204).end();
                });
            },
        );

        this.app.get(
            "/teapot/mcp/browser/proposals",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const query = ProposalListQuery.safeParse(req.query);
                if (!query.success) {
                    res.status(400).json({ error: "Invalid request" });
                    return;
                }
                await this.withBrowserIdentity(res, true, async (ownerId) => {
                    res.json(
                        await teapotMcpAuthoringService.listProposals(ownerId, query.data.sessionId, query.data.state),
                    );
                });
            },
        );

        this.app.get(
            "/teapot/mcp/browser/proposals/:proposalId",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const params = ProposalParams.safeParse(req.params);
                if (!params.success) {
                    res.status(400).json({ error: "Invalid request" });
                    return;
                }
                await this.withBrowserIdentity(res, true, async (ownerId) => {
                    res.json(
                        await teapotMcpAuthoringService.getProposal(ownerId, params.data.proposalId, undefined, true),
                    );
                });
            },
        );

        this.app.post(
            "/teapot/mcp/browser/proposals/:proposalId/approve",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const params = ProposalParams.safeParse(req.params);
                if (!params.success) {
                    res.status(400).json({ error: "Invalid request" });
                    return;
                }
                await this.withBrowserIdentity(res, true, async (ownerId) => {
                    await teapotMcpAuthoringService.approveProposal(ownerId, params.data.proposalId);
                    res.json(
                        await teapotMcpAuthoringService.getProposal(ownerId, params.data.proposalId, undefined, true),
                    );
                });
            },
        );

        this.app.post(
            "/teapot/mcp/browser/proposals/:proposalId/deny",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const params = ProposalParams.safeParse(req.params);
                if (!params.success) {
                    res.status(400).json({ error: "Invalid request" });
                    return;
                }
                await this.withBrowserIdentity(res, true, async (ownerId) => {
                    res.json(await teapotMcpAuthoringService.denyProposal(ownerId, params.data.proposalId));
                });
            },
        );

        this.app.post(
            "/teapot/mcp/browser/proposals/:proposalId/claim-paid-generation",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const params = ProposalParams.safeParse(req.params);
                const body = ApplyBody.safeParse(req.body);
                if (!params.success || !body.success) {
                    res.status(400).json({ error: "A proposal ID and approval token are required" });
                    return;
                }
                await this.withBrowserIdentity(res, true, async (ownerId) => {
                    res.json(
                        await teapotMcpAuthoringService.claimPaidGeneration(
                            ownerId,
                            params.data.proposalId,
                            body.data.approvalToken,
                        ),
                    );
                });
            },
        );

        this.app.post(
            "/teapot/mcp/browser/proposals/:proposalId/complete-paid-generation",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const params = ProposalParams.safeParse(req.params);
                const body = CompletePaidBody.safeParse(req.body);
                const result = body.success
                    ? TeapotPaidGenerationCompletionResult.safeParse(body.data.result)
                    : undefined;
                const serializedResult = result?.success ? JSON.stringify(result.data) : undefined;
                if (
                    !params.success ||
                    !body.success ||
                    !result?.success ||
                    serializedResult === undefined ||
                    Buffer.byteLength(serializedResult) > 32_768
                ) {
                    res.status(400).json({ error: "Invalid request" });
                    return;
                }
                await this.withBrowserIdentity(res, true, async (ownerId) => {
                    res.json(
                        await teapotMcpAuthoringService.completePaidGeneration(
                            ownerId,
                            params.data.proposalId,
                            body.data.approvalToken,
                            result.data,
                        ),
                    );
                });
            },
        );
    }

    private mcpRoutes(): void {
        this.app.get("/teapot/mcp/session", async (req: Request, res: Response) => {
            await this.withMcpSession(req, res, (session) => {
                res.json(session);
                return Promise.resolve();
            });
        });

        this.app.get("/teapot/mcp/capabilities", async (req: Request, res: Response) => {
            await this.withMcpSession(req, res, () => {
                res.json(teapotMcpAuthoringService.capabilities());
                return Promise.resolve();
            });
        });

        this.app.get("/teapot/mcp/terrain-catalog", async (req: Request, res: Response) => {
            const query = TerrainCatalogQuery.safeParse(req.query);
            if (!query.success) {
                res.status(400).json({ error: "Invalid terrain catalog query" });
                return;
            }
            await this.withMcpSession(req, res, () => {
                const matches = searchBuiltInTerrainAssets(query.data);
                const items = matches.slice(0, query.data.limit);
                res.json({
                    version: BUILT_IN_TERRAIN_CATALOG_VERSION,
                    tileset: {
                        id: "workadventure-lpc-outdoor-terrain",
                        image: "/resources/tilesets/lpc-outdoor-terrain.png",
                        tileWidth: 32,
                        tileHeight: 32,
                    },
                    tilesets: BUILT_IN_TERRAIN_TILESETS.map(({ id, image }) => ({
                        id,
                        image,
                        tileWidth: 32,
                        tileHeight: 32,
                    })),
                    total: matches.length,
                    available: ALL_BUILT_IN_TERRAIN_ASSETS.length,
                    items,
                });
                return Promise.resolve();
            });
        });

        this.app.get("/teapot/mcp/asset-catalog", async (req: Request, res: Response) => {
            const query = AssetCatalogQuery.safeParse(req.query);
            if (!query.success) {
                res.status(400).json({ error: "Invalid atlas asset catalog query" });
                return;
            }
            await this.withMcpSession(req, res, () => {
                const matches = searchBuiltInAtlasAssets(query.data);
                const items = matches.slice(0, query.data.limit);
                res.json({
                    version: BUILT_IN_TERRAIN_CATALOG_VERSION,
                    tileset: {
                        id: "workadventure-lpc-outdoor-terrain",
                        image: "/resources/tilesets/lpc-outdoor-terrain.png",
                        tileWidth: 32,
                        tileHeight: 32,
                    },
                    total: matches.length,
                    available: BUILT_IN_ATLAS_ASSETS.length,
                    terrainAvailable: BUILT_IN_TERRAIN_ASSETS.length,
                    items,
                });
                return Promise.resolve();
            });
        });

        this.app.get("/teapot/mcp/maps/summary", async (req: Request, res: Response) => {
            const query = MapSummaryQuery.safeParse(req.query);
            if (!query.success) {
                res.status(400).json({ error: "A valid map URL is required" });
                return;
            }
            await this.withMcpSession(req, res, async (session) => {
                res.json(await teapotMcpAuthoringService.mapSummary(session, query.data.mapUrl));
            });
        });

        this.app.post("/teapot/mcp/maps/validate", async (req: Request, res: Response) => {
            const body = z.object({ patch: z.unknown() }).strict().safeParse(req.body);
            if (!body.success || !TeapotMapPatch.safeParse(body.data.patch).success) {
                res.status(400).json({ error: "A valid structured map patch is required" });
                return;
            }
            await this.withMcpSession(req, res, async (session) => {
                res.json(await teapotMcpAuthoringService.validateMapPatch(session, body.data.patch));
            });
        });

        this.app.post("/teapot/mcp/proposals/map-patch", async (req: Request, res: Response) => {
            const body = z.object({ patch: z.unknown() }).strict().safeParse(req.body);
            if (!body.success || !TeapotMapPatch.safeParse(body.data.patch).success) {
                res.status(400).json({ error: "A valid structured map patch is required" });
                return;
            }
            await this.withMcpSession(req, res, async (session) => {
                res.status(201).json(await teapotMcpAuthoringService.createMapPatchProposal(session, body.data.patch));
            });
        });

        this.app.post("/teapot/mcp/proposals/paid-generation", async (req: Request, res: Response) => {
            const body = z.object({ request: z.unknown() }).strict().safeParse(req.body);
            if (!body.success || !TeapotPaidGenerationRequest.safeParse(body.data.request).success) {
                res.status(400).json({ error: "A valid paid generation request is required" });
                return;
            }
            await this.withMcpSession(req, res, async (session) => {
                res.status(201).json(
                    await teapotMcpAuthoringService.createPaidGenerationProposal(session, body.data.request),
                );
            });
        });

        this.app.post("/teapot/mcp/proposals/undo", async (req: Request, res: Response) => {
            const body = UndoBody.safeParse(req.body);
            if (!body.success) {
                res.status(400).json({ error: "A valid undo proposal is required" });
                return;
            }
            await this.withMcpSession(req, res, async (session) => {
                res.status(201).json(await teapotMcpAuthoringService.createUndoProposal(session, body.data));
            });
        });

        this.app.get("/teapot/mcp/proposals", async (req: Request, res: Response) => {
            const query = z
                .object({ state: z.enum(TEAPOT_MCP_PROPOSAL_STATES).optional() })
                .strict()
                .safeParse(req.query);
            if (!query.success) {
                res.status(400).json({ error: "Invalid proposal state" });
                return;
            }
            await this.withMcpSession(req, res, async (session) => {
                res.json(
                    await teapotMcpAuthoringService.listProposals(session.ownerId, session.sessionId, query.data.state),
                );
            });
        });

        this.app.get("/teapot/mcp/proposals/:proposalId", async (req: Request, res: Response) => {
            const params = ProposalParams.safeParse(req.params);
            if (!params.success) {
                res.status(400).json({ error: "Invalid proposal ID" });
                return;
            }
            await this.withMcpSession(req, res, async (session) => {
                res.json(
                    await teapotMcpAuthoringService.getProposal(
                        session.ownerId,
                        params.data.proposalId,
                        session.sessionId,
                        true,
                    ),
                );
            });
        });

        this.app.post("/teapot/mcp/proposals/:proposalId/apply", async (req: Request, res: Response) => {
            const params = ProposalParams.safeParse(req.params);
            const body = ApplyBody.safeParse(req.body);
            if (!params.success || !body.success) {
                res.status(400).json({ error: "A proposal ID and approval token are required" });
                return;
            }
            await this.withMcpSession(req, res, async (session) => {
                res.json(
                    await teapotMcpAuthoringService.applyProposal(
                        session,
                        params.data.proposalId,
                        body.data.approvalToken,
                    ),
                );
            });
        });
    }

    private async withBrowserIdentity(
        res: ResponseWithUserIdentifier,
        validInput: boolean,
        operation: (ownerId: string) => Promise<void>,
    ): Promise<void> {
        if (!validInput) {
            res.status(400).json({ error: "Invalid request" });
            return;
        }
        if (!res.userIdentifier) {
            res.status(401).json({ error: "Authentication is required" });
            return;
        }
        try {
            const identity = await resolveTeapotRequestIdentity(res.userIdentifier);
            res.setHeader("Cache-Control", "no-store");
            await operation(identity.id);
        } catch (error: unknown) {
            this.sendError(res, error);
        }
    }

    private async withMcpSession(
        req: Request,
        res: Response,
        operation: (session: TeapotMcpSessionContext) => Promise<void>,
    ): Promise<void> {
        const token = readBearerToken(req.header("authorization"));
        if (token === undefined) {
            res.status(401).setHeader("WWW-Authenticate", "Bearer");
            res.json({ error: "A Teapot MCP bearer token is required" });
            return;
        }
        try {
            const session = await teapotMcpAuthoringService.authenticateToken(token);
            await assertTeapotMcpSessionAuthoringAccess(session.ownerId);
            res.setHeader("Cache-Control", "no-store");
            await operation(session);
        } catch (error: unknown) {
            this.sendError(res, error);
        }
    }

    private sendError(res: Response, error: unknown): void {
        if (sendTeapotAuthoringAccessError(res, error)) return;
        if (error instanceof TeapotMcpAuthoringError || error instanceof TeapotMapPublicationError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }
        if (error instanceof TeapotAuthorizationError) {
            res.status(403).json({ error: error.message });
            return;
        }
        if (error instanceof TeapotMapRevisionConflictError || error instanceof TeapotMapWriterLeaseConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        if (error instanceof TeapotSemanticPatchError) {
            res.status(400).json({ error: error.message, code: error.code });
            return;
        }
        throw error;
    }
}

function readBearerToken(authorization: string | undefined): string | undefined {
    const match = authorization === undefined ? null : /^Bearer ([A-Za-z0-9._~-]{32,2048})$/.exec(authorization);
    return match?.[1];
}
