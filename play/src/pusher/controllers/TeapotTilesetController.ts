import type { Application, Request, Response } from "express";
import express from "express";
import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import { z } from "zod";
import { VisualAssetAnimation } from "@workadventure/map-editor";

import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { teapotAuthoringGate } from "../middlewares/TeapotAuthoringMiddleware";
import { TeapotAuthorizationError, TeapotDataConflictError } from "../teapot/TeapotDataErrors";
import type { TeapotTilesetService } from "../teapot/TeapotTilesetService";
import { TeapotWokaValidationError } from "../teapot/TeapotWokaPngValidator";
import { validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const animationQuery = z
    .string()
    .max(4096)
    .transform((value, context) => {
        try {
            return JSON.parse(value) as unknown;
        } catch {
            context.addIssue({ code: z.ZodIssueCode.custom, message: "Animation metadata must be valid JSON" });
            return z.NEVER;
        }
    })
    .pipe(VisualAssetAnimation);

const uploadQuery = z.object({
    name: z.string().min(1).max(80),
    source: z.enum(["generated", "imported"]).default("imported"),
    providerId: z.string().max(80).optional(),
    modelId: z.string().max(160).optional(),
    animation: animationQuery.optional(),
});
const assetParams = z.object({ assetId: z.string().min(1).max(128) });

export class TeapotTilesetController extends BaseHttpController {
    constructor(
        app: Application,
        private readonly service: TeapotTilesetService,
    ) {
        super(app);
    }

    protected routes(): void {
        this.app.get("/teapot/tileset-assets/:assetId.png", async (req: Request, res: Response) => {
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
                sendError(res, error);
            }
        });

        this.app.get(
            "/teapot/tilesets",
            [authenticated, teapotAuthoringGate],
            async (_req: Request, res: ResponseWithUserIdentifier) => {
                const providerSubject = requireProviderSubject(res);
                if (providerSubject === null) return;
                try {
                    res.set("Cache-Control", "private, no-store");
                    res.status(200).json(await this.service.list(providerSubject));
                } catch (error: unknown) {
                    sendError(res, error);
                }
            },
        );

        this.app.post(
            "/teapot/tilesets",
            [authenticated, teapotAuthoringGate, express.raw({ type: "image/png", limit: "4mb" })],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const providerSubject = requireProviderSubject(res);
                if (providerSubject === null) return;
                const query = validateQuery(req, res, uploadQuery);
                if (query === undefined) return;
                if (!Buffer.isBuffer(req.body)) {
                    res.status(415).json({ error: "Expected an image/png body" });
                    return;
                }
                try {
                    res.status(201).json(
                        await this.service.accept(
                            providerSubject,
                            query.name,
                            req.body,
                            {
                                source: query.source,
                                ...(query.providerId === undefined ? {} : { providerId: query.providerId }),
                                ...(query.modelId === undefined ? {} : { modelId: query.modelId }),
                            },
                            query.animation,
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
    if (cause instanceof TeapotWokaValidationError) {
        res.status(422).json({ error: cause.message });
        return;
    }
    if (cause instanceof TeapotAuthorizationError) {
        res.status(403).json({ error: "This account cannot manage tilesets" });
        return;
    }
    if (cause instanceof TeapotDataConflictError) {
        res.status(409).json({ error: cause.message });
        return;
    }
    console.error("Tileset request failed", cause);
    Sentry.captureException(cause);
    res.status(500).json({ error: "Tileset request failed" });
}
