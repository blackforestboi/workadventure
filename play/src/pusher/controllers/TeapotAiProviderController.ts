import type { Application, Request, Response } from "express";
import { z } from "zod";

import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { teapotAuthoringGate } from "../middlewares/TeapotAuthoringMiddleware";
import {
    TeapotAgentBridgeClient,
    TeapotAgentBridgeError,
    type TeapotHostedAgentProvider,
} from "../teapot/TeapotAgentBridgeClient";
import { BaseHttpController } from "./BaseHttpController";

const providerParams = z.object({ provider: z.enum(["codex", "claude"]) });
const statusQuery = z.object({ pairingId: z.string().min(8).max(180) });
const completionBody = z.object({ pairingId: z.string().min(8).max(180), code: z.string().min(1).max(4_096) });
const referenceSchema = z.object({
    name: z.string().min(1).max(220),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    base64: z.string().min(1).max(12_000_000),
});
const generationBody = z.object({
    model: z.string().min(1).max(180),
    prompt: z.string().min(1).max(12_000),
    target: z.enum(["woka-sheet", "woka-layer", "map-object", "tileset"]),
    references: z.array(referenceSchema).max(8).default([]),
});

export class TeapotAiProviderController extends BaseHttpController {
    public constructor(
        app: Application,
        private readonly bridge: TeapotAgentBridgeClient,
    ) {
        super(app);
    }

    protected routes(): void {
        const gate = [authenticated, teapotAuthoringGate];

        this.app.post(
            "/teapot/ai/providers/:provider/oauth/start",
            gate,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                await this.withOwner(req, res, (owner, provider) => this.bridge.startOAuth(owner, provider));
            },
        );
        this.app.get(
            "/teapot/ai/providers/:provider/oauth/status",
            gate,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const query = statusQuery.safeParse(req.query);
                if (!query.success) return void res.status(400).json({ error: "A valid pairing ID is required" });
                await this.withOwner(req, res, (owner, provider) =>
                    this.bridge.oauthStatus(owner, provider, query.data.pairingId),
                );
            },
        );
        this.app.post(
            "/teapot/ai/providers/:provider/oauth/complete",
            gate,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const body = completionBody.safeParse(req.body);
                if (!body.success)
                    return void res.status(400).json({ error: "A valid authorization code is required" });
                await this.withOwner(req, res, (owner, provider) =>
                    this.bridge.completeOAuth(owner, provider, body.data.pairingId, body.data.code),
                );
            },
        );
        this.app.delete(
            "/teapot/ai/providers/:provider/connection",
            gate,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                await this.withOwner(req, res, async (owner, provider) => {
                    await this.bridge.disconnect(owner, provider);
                    return { disconnected: true };
                });
            },
        );
        this.app.get(
            "/teapot/ai/providers/:provider/connection",
            gate,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                await this.withOwner(req, res, async (owner, provider) => ({
                    connected: await this.bridge.isConnected(owner, provider),
                }));
            },
        );
        this.app.get(
            "/teapot/ai/providers/:provider/models",
            gate,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                await this.withOwner(req, res, async (owner, provider) => ({
                    models: await this.bridge.listModels(owner, provider),
                }));
            },
        );
        this.app.post(
            "/teapot/ai/providers/:provider/generate",
            gate,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const body = generationBody.safeParse(req.body);
                if (!body.success) return void res.status(400).json({ error: "The generation request is invalid" });
                await this.withOwner(req, res, (owner, provider) => this.bridge.generate(owner, provider, body.data));
            },
        );
    }

    private async withOwner(
        req: Request,
        res: ResponseWithUserIdentifier,
        operation: (owner: string, provider: TeapotHostedAgentProvider) => Promise<unknown>,
    ): Promise<void> {
        const params = providerParams.safeParse(req.params);
        if (!params.success) {
            res.status(404).json({ error: "AI provider not found" });
            return;
        }
        const owner = res.userIdentifier;
        if (owner === undefined || owner.length === 0) {
            res.status(401).json({ error: "Authenticated user identifier is missing" });
            return;
        }
        try {
            res.set("Cache-Control", "private, no-store");
            res.status(200).json(await operation(owner, params.data.provider));
        } catch (error: unknown) {
            sendBridgeError(res, error);
        }
    }
}

function sendBridgeError(res: Response, error: unknown): void {
    if (error instanceof TeapotAgentBridgeError) {
        res.status(error.status).json({ error: error.message });
        return;
    }
    res.status(502).json({ error: "The hosted AI connection request failed" });
}
