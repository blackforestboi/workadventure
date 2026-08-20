import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import type { Application, Request, Response } from "express";
import { z } from "zod";

import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { teapotAuthoringGate } from "../middlewares/TeapotAuthoringMiddleware";
import { TeapotAuthorizationError, TeapotDataConflictError, TeapotDataNotFoundError } from "../teapot/TeapotDataErrors";
import { TeapotMapStyleValidationError } from "../teapot/TeapotMapStyleContracts";
import type { TeapotMapStyleService } from "../teapot/TeapotMapStyleService";
import { TeapotMapStyleSourceUnavailableError } from "../teapot/TeapotMapStyleService";
import { BaseHttpController } from "./BaseHttpController";

const assetKind = z.enum(["woka", "woka-part", "map-entity", "tileset", "reference", "terrain-surface", "vegetation"]);
const idempotencyKey = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/);
const listQuery = z.object({ styleId: z.string().min(1).max(128).optional(), kind: assetKind.optional() }).strict();
const createBody = z.object({ name: z.string().max(160), idempotencyKey }).strict();
const copyBody = z
    .object({
        idempotencyKey,
        source: z.discriminatedUnion("type", [
            z
                .object({
                    type: z.literal("teapot-asset"),
                    assetId: z.string().min(1).max(128),
                    sourceVersion: z.literal(1),
                })
                .strict(),
            z
                .object({
                    type: z.literal("built-in"),
                    namespace: z.string().min(1).max(64),
                    key: z.string().min(1).max(256),
                    sourceVersion: z.number().int().positive(),
                })
                .strict(),
        ]),
    })
    .strict();
const styleParams = z.object({ styleId: z.string().min(1).max(128) }).strict();

export class TeapotMapStyleController extends BaseHttpController {
    constructor(
        app: Application,
        private readonly service: TeapotMapStyleService,
    ) {
        super(app);
    }

    protected routes(): void {
        this.app.get(
            "/teapot/map-styles",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const subject = requireProviderSubject(res);
                if (subject === null) return;
                const query = listQuery.safeParse(req.query);
                if (!query.success) {
                    res.status(400).json({ error: "Invalid style request" });
                    return;
                }
                try {
                    res.set("Cache-Control", "private, no-store");
                    res.status(200).json(await this.service.list(subject, query.data.styleId, query.data.kind));
                } catch (error: unknown) {
                    sendError(res, error);
                }
            },
        );
        this.app.post(
            "/teapot/map-styles",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const subject = requireProviderSubject(res);
                if (subject === null) return;
                const body = createBody.safeParse(req.body);
                if (!body.success) {
                    res.status(400).json({ error: "Invalid style request" });
                    return;
                }
                try {
                    res.set("Cache-Control", "private, no-store");
                    res.status(201).json(await this.service.create(subject, body.data.name, body.data.idempotencyKey));
                } catch (error: unknown) {
                    sendError(res, error);
                }
            },
        );
        this.app.post(
            "/teapot/map-styles/:styleId/entries",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const subject = requireProviderSubject(res);
                if (subject === null) return;
                const params = styleParams.safeParse(req.params);
                const body = copyBody.safeParse(req.body);
                if (!params.success || !body.success) {
                    res.status(400).json({ error: "Invalid style request" });
                    return;
                }
                try {
                    res.set("Cache-Control", "private, no-store");
                    res.status(201).json(
                        await this.service.copy(
                            subject,
                            params.data.styleId,
                            body.data.source,
                            body.data.idempotencyKey,
                        ),
                    );
                } catch (error: unknown) {
                    sendError(res, error);
                }
            },
        );
    }
}

function requireProviderSubject(res: ResponseWithUserIdentifier): string | null {
    if (res.userIdentifier !== undefined && res.userIdentifier.length > 0) return res.userIdentifier;
    res.status(401).json({ error: "Authenticated user identifier is missing" });
    return null;
}

function sendError(res: Response, error: unknown): void {
    const cause = asError(error);
    if (cause instanceof TeapotMapStyleValidationError) {
        res.status(422).json({ error: cause.message });
        return;
    }
    if (cause instanceof TeapotDataConflictError) {
        res.status(409).json({ error: cause.message });
        return;
    }
    if (cause instanceof TeapotAuthorizationError) {
        res.status(403).json({ error: "This account cannot manage map styles" });
        return;
    }
    if (cause instanceof TeapotDataNotFoundError || cause instanceof TeapotMapStyleSourceUnavailableError) {
        res.status(404).json({ error: "The requested style or source is unavailable" });
        return;
    }
    console.error("Map style request failed", cause);
    Sentry.captureException(cause);
    res.status(500).json({ error: "Map style request failed" });
}
