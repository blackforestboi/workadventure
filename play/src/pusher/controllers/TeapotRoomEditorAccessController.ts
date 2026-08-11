import type { Application, Request } from "express";
import { z } from "zod";

import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { adminService } from "../services/AdminService";
import { TeapotAuthorizationError, TeapotDataConflictError, TeapotDataNotFoundError } from "../teapot/TeapotDataErrors";
import { getTeapotDataServices } from "../teapot/TeapotDataRuntime";
import { resolveTeapotRequestIdentity } from "../teapot/TeapotRequestIdentityResolver";
import { AdminTeapotMapUrlResolver } from "../teapot/TeapotWamRevisionCoordinator";
import type { TeapotRoomEditorAccessRecord, TeapotRoomEditorMode } from "../teapot/TeapotRecords";
import { MAP_EDITOR_ALLOW_ALL_USERS } from "../enums/EnvironmentVariable";
import { BaseHttpController } from "./BaseHttpController";

const RoomQuery = z.object({ roomId: z.string().url().max(2_048) });
const EditorInput = z
    .object({
        identifier: z.string().trim().min(1).max(512),
        displayName: z.string().trim().min(1).max(128).optional(),
    })
    .strict();
const UpdateBody = z
    .object({
        roomId: z.string().url().max(2_048),
        mode: z.enum(["everyone", "specific", "nobody"]),
        expectedVersion: z.number().int().nonnegative(),
        editors: z.array(EditorInput).max(200),
    })
    .strict();

interface PublicRoomEditor {
    userId: string;
    identifier: string;
    displayName: string;
}

interface PublicRoomEditorAccess {
    configured: boolean;
    mapId: string;
    mode: TeapotRoomEditorMode;
    version: number;
    editors: PublicRoomEditor[];
}

/** Admin-only policy API. Frontend visibility is convenience; this controller is the authority. */
export class TeapotRoomEditorAccessController extends BaseHttpController {
    public constructor(
        app: Application,
        private readonly mapUrlResolver = new AdminTeapotMapUrlResolver(),
    ) {
        super(app);
    }

    protected routes(): void {
        this.app.get(
            "/teapot/rooms/editor-access",
            authenticated,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                this.noStore(res);
                const parsed = RoomQuery.safeParse(req.query);
                if (!parsed.success || !res.userIdentifier) {
                    res.status(parsed.success ? 401 : 400).json({ error: "invalid_request" });
                    return;
                }
                try {
                    await this.assertCanManage(req, res, parsed.data.roomId);
                    const mapId = await this.mapUrlResolver.resolve(parsed.data.roomId, req.header("authorization"));
                    const services = getTeapotDataServices();
                    const policy = await services.repository.getRoomEditorPolicy(mapId);
                    if (policy === null) {
                        res.json({
                            configured: false,
                            mapId,
                            mode: MAP_EDITOR_ALLOW_ALL_USERS ? "everyone" : "specific",
                            version: 0,
                            editors: [],
                        } satisfies PublicRoomEditorAccess);
                        return;
                    }
                    res.json(
                        await this.toPublic({ policy, grants: await services.repository.listRoomEditorGrants(mapId) }),
                    );
                } catch (error: unknown) {
                    this.sendError(res, error);
                }
            },
        );

        this.app.put(
            "/teapot/rooms/editor-access",
            authenticated,
            async (req: Request, res: ResponseWithUserIdentifier) => {
                this.noStore(res);
                const parsed = UpdateBody.safeParse(req.body);
                if (!parsed.success || !res.userIdentifier) {
                    res.status(parsed.success ? 401 : 400).json({ error: "invalid_request" });
                    return;
                }
                try {
                    const actor = await this.assertCanManage(req, res, parsed.data.roomId);
                    const mapId = await this.mapUrlResolver.resolve(parsed.data.roomId, req.header("authorization"));
                    const services = getTeapotDataServices();
                    const existing = await services.repository.getRoomEditorPolicy(mapId);
                    const uniqueEditors = [
                        ...new Map(parsed.data.editors.map((editor) => [editor.identifier, editor])).values(),
                    ];
                    const resolvedEditors = await Promise.all(
                        uniqueEditors.map(async (editor) => ({
                            ...editor,
                            identity: await resolveTeapotRequestIdentity(editor.identifier, editor.displayName),
                        })),
                    );
                    const updated = await services.repository.replaceRoomEditorPolicy({
                        mapId,
                        mode: parsed.data.mode,
                        expectedVersion:
                            existing === null && parsed.data.expectedVersion === 0 ? null : parsed.data.expectedVersion,
                        editorIds: resolvedEditors.map(({ identity }) => identity.id),
                        actorId: actor.id,
                    });
                    await services.repository
                        .appendAuditEvent({
                            actorId: actor.id,
                            action: "room.editor-access.updated",
                            objectType: "map",
                            objectId: mapId,
                            details: {
                                mode: parsed.data.mode,
                                version: updated.policy.version,
                                editorIds: updated.grants.map((grant) => grant.userId),
                            },
                        })
                        .catch((error: unknown) =>
                            console.error("Could not append room editor access audit event", error),
                        );
                    res.json(await this.toPublic(updated));
                } catch (error: unknown) {
                    this.sendError(res, error);
                }
            },
        );
    }

    private async assertCanManage(
        req: Request,
        res: ResponseWithUserIdentifier,
        roomId: string,
    ): Promise<TeapotIdentity> {
        const identifier = res.userIdentifier;
        if (!identifier) throw new TeapotAuthorizationError("Authentication is required");
        const identity = await resolveTeapotRequestIdentity(identifier, res.username);
        if (identity.admissionState === "suspended") {
            throw new TeapotAuthorizationError("Suspended users cannot manage room editor access");
        }
        if (await getTeapotDataServices().authorization.hasCapability(identity.id, "map.manage-any")) {
            return identity;
        }
        const member = await adminService.fetchMemberDataByUuid(
            identifier,
            res.accessToken,
            roomId,
            req.ip ?? "",
            [],
            undefined,
            undefined,
            res.tags,
        );
        if (member.status !== "ok" || !member.tags.includes("admin")) {
            throw new TeapotAuthorizationError("Current room admin access is required");
        }
        return identity;
    }

    private async toPublic(access: TeapotRoomEditorAccessRecord): Promise<PublicRoomEditorAccess> {
        const repository = getTeapotDataServices().repository;
        const editors = await Promise.all(
            access.grants.map(async (grant): Promise<PublicRoomEditor> => {
                const [identity, providerLink] = await Promise.all([
                    repository.getIdentity(grant.userId),
                    repository.findProviderLinkForUser(grant.userId, "workadventure"),
                ]);
                const identifier = providerLink?.providerSubject ?? grant.userId;
                return {
                    userId: grant.userId,
                    identifier,
                    displayName: identity?.displayName ?? identifier,
                };
            }),
        );
        return {
            configured: true,
            mapId: access.policy.mapId,
            mode: access.policy.mode,
            version: access.policy.version,
            editors,
        };
    }

    private noStore(res: ResponseWithUserIdentifier): void {
        res.setHeader("Cache-Control", "no-store");
    }

    private sendError(res: ResponseWithUserIdentifier, error: unknown): void {
        if (error instanceof TeapotAuthorizationError) {
            res.status(403).json({ error: "not_allowed", message: error.message });
            return;
        }
        if (error instanceof TeapotDataConflictError) {
            res.status(409).json({ error: "policy_conflict", message: error.message });
            return;
        }
        if (error instanceof TeapotDataNotFoundError) {
            res.status(404).json({ error: "not_found", message: error.message });
            return;
        }
        console.error("Room editor access request failed", error);
        res.status(502).json({ error: "room_access_unavailable" });
    }
}
