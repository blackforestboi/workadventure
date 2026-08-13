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
import type { TeapotGeneratedAssetService } from "../teapot/TeapotGeneratedAssetService";
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
    kind: z.enum(["map-entity", "reference", "terrain-surface", "vegetation"]),
    source: z.enum(["generated", "imported"]).default("generated"),
    providerId: z.string().max(80).optional(),
    modelId: z.string().max(160).optional(),
    animation: animationQuery.optional(),
    gridColumns: z.coerce.number().int().positive().optional(),
    gridRows: z.coerce.number().int().positive().optional(),
    tilePixelSize: z.coerce.number().int().positive().optional(),
});
const listQuery = z.object({ kind: z.enum(["map-entity", "reference", "terrain-surface", "vegetation"]) });
const assetParams = z.object({ assetId: z.string().min(1).max(128) });

export class TeapotGeneratedAssetController extends BaseHttpController {
    constructor(
        app: Application,
        private readonly service: TeapotGeneratedAssetService,
    ) {
        super(app);
    }

    protected routes(): void {
        this.app.get("/teapot/generated-assets/:assetId.png", async (req: Request, res: Response) => {
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
            "/teapot/generated-assets/private/:assetId.png",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const providerSubject = requireProviderSubject(res);
                if (providerSubject === null) return;
                const params = assetParams.safeParse(req.params);
                if (!params.success) {
                    res.status(404).send("Not found");
                    return;
                }
                try {
                    const raster = await this.service.getOwnerRaster(providerSubject, params.data.assetId);
                    if (raster === null) {
                        res.status(404).send("Not found");
                        return;
                    }
                    res.set({
                        "Cache-Control": "private, no-store",
                        "Content-Disposition": "inline",
                        "Content-Security-Policy": "default-src 'none'; sandbox",
                        "X-Content-Type-Options": "nosniff",
                    });
                    res.status(200).type("png").send(raster.bytes);
                } catch (error: unknown) {
                    sendError(res, error);
                }
            },
        );

        this.app.get(
            "/teapot/generated-assets",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const providerSubject = requireProviderSubject(res);
                if (providerSubject === null) return;
                const query = validateQuery(req, res, listQuery);
                if (query === undefined) return;
                try {
                    res.set("Cache-Control", "private, no-store");
                    res.status(200).json(await this.service.list(providerSubject, query.kind));
                } catch (error: unknown) {
                    sendError(res, error);
                }
            },
        );

        this.app.post(
            "/teapot/generated-assets",
            [authenticated, teapotAuthoringGate, express.raw({ type: "image/png", limit: "8mb" })],
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
                            query.kind,
                            {
                                source: query.source,
                                ...(query.providerId === undefined ? {} : { providerId: query.providerId }),
                                ...(query.modelId === undefined ? {} : { modelId: query.modelId }),
                            },
                            query.animation,
                            query.gridColumns === undefined ||
                                query.gridRows === undefined ||
                                query.tilePixelSize === undefined
                                ? undefined
                                : {
                                      columns: query.gridColumns as 5,
                                      rows: query.gridRows as 5,
                                      tilePixelSize: query.tilePixelSize,
                                  },
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
        res.status(403).json({ error: "This account cannot manage generated assets" });
        return;
    }
    if (cause instanceof TeapotDataConflictError) {
        res.status(409).json({ error: cause.message });
        return;
    }
    console.error("Generated asset request failed", cause);
    Sentry.captureException(cause);
    res.status(500).json({ error: "Generated asset request failed" });
}
