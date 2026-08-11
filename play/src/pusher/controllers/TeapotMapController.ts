import type { Application, Request } from "express";
import { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { z } from "zod";

import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { teapotAuthoringGate } from "../middlewares/TeapotAuthoringMiddleware";
import {
    TeapotAuthorizationError,
    TeapotMapRevisionConflictError,
    TeapotMapWriterLeaseConflictError,
} from "../teapot/TeapotDataErrors";
import { TeapotMapPublicationError, teapotMapPublicationService } from "../teapot/TeapotMapPublicationService";
import { resolveTeapotRequestIdentity } from "../teapot/TeapotRequestIdentityResolver";
import {
    TeapotWorldCreationError,
    teapotWorldCreationService,
    type TeapotWorldCreationService,
} from "../teapot/TeapotWorldCreationService";
import { BaseHttpController } from "./BaseHttpController";

const RevisionQuery = z.object({ mapUrl: z.string().url().max(2_048) });
const PublicationBody = z
    .object({
        mapUrl: z.string().url().max(2_048),
        expectedRevision: z.number().int().nonnegative(),
        map: ITiledMap,
    })
    .strict();
const CreateWorldBody = z.object({ sourceRoomUrl: z.string().url().max(2_048).optional() }).strict();

export class TeapotMapController extends BaseHttpController {
    public constructor(
        app: Application,
        private readonly worldCreationService: Pick<TeapotWorldCreationService, "create"> = teapotWorldCreationService,
    ) {
        super(app);
    }

    protected routes(): void {
        this.app.get(
            "/teapot/maps/revision",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const parsed = RevisionQuery.safeParse(req.query);
                if (!parsed.success || !res.userIdentifier) {
                    res.status(parsed.success ? 401 : 400).json({ error: "A valid authenticated map URL is required" });
                    return;
                }
                try {
                    await resolveTeapotRequestIdentity(res.userIdentifier);
                    res.setHeader("Cache-Control", "no-store");
                    res.json(await teapotMapPublicationService.currentRevision(parsed.data.mapUrl));
                } catch (error: unknown) {
                    this.sendError(res, error);
                }
            },
        );

        this.app.post(
            "/teapot/maps/publish-tmj",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const parsed = PublicationBody.safeParse(req.body);
                if (!parsed.success || !res.userIdentifier) {
                    res.status(parsed.success ? 401 : 400).json({
                        error: "A valid authenticated TMJ publication is required",
                    });
                    return;
                }
                try {
                    const identity = await resolveTeapotRequestIdentity(res.userIdentifier);
                    const result = await teapotMapPublicationService.publish({
                        actorId: identity.id,
                        mapUrl: parsed.data.mapUrl,
                        expectedRevision: parsed.data.expectedRevision,
                        map: parsed.data.map,
                    });
                    res.setHeader("Cache-Control", "no-store");
                    res.status(201).json(result);
                } catch (error: unknown) {
                    this.sendError(res, error);
                }
            },
        );

        this.app.post(
            "/teapot/worlds",
            [authenticated, teapotAuthoringGate],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const parsed = CreateWorldBody.safeParse(req.body ?? {});
                if (!parsed.success || !res.userIdentifier) {
                    res.status(parsed.success ? 401 : 400).json({
                        error: "A valid world creation request is required",
                    });
                    return;
                }
                try {
                    const identity = await resolveTeapotRequestIdentity(res.userIdentifier);
                    const result = await this.worldCreationService.create({
                        actorId: identity.id,
                        sourceRoomUrl: parsed.data.sourceRoomUrl,
                    });
                    res.setHeader("Cache-Control", "no-store");
                    res.status(201).json(result);
                } catch (error: unknown) {
                    this.sendError(res, error);
                }
            },
        );
    }

    private sendError(res: ResponseWithUserIdentifier, error: unknown): void {
        if (error instanceof TeapotMapPublicationError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }
        if (error instanceof TeapotWorldCreationError) {
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
        throw error;
    }
}
