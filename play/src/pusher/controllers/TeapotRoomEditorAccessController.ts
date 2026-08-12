import type { Application, Request } from "express";
import { z } from "zod";

import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import { MAP_EDITOR_ALLOW_ALL_USERS } from "../enums/EnvironmentVariable";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { adminService } from "../services/AdminService";
import { TeapotAuthorizationError, TeapotDataConflictError, TeapotDataNotFoundError } from "../teapot/TeapotDataErrors";
import { getTeapotDataServices } from "../teapot/TeapotDataRuntime";
import { resolveTeapotRequestIdentity } from "../teapot/TeapotRequestIdentityResolver";
import type {
    TeapotRoomAccessMode,
    TeapotRoomAccessRecord,
    TeapotRoomAccessRole,
    TeapotRoomVisitorRecord,
} from "../teapot/TeapotRecords";
import { AdminTeapotMapUrlResolver, type TeapotMapUrlResolver } from "../teapot/TeapotWamRevisionCoordinator";
import { BaseHttpController } from "./BaseHttpController";

const RoomRole = z.enum(["view", "edit", "admin", "directory"]);
const RoomQuery = z.object({ roomId: z.string().url().max(2_048) });
const MemberInput = z
    .object({
        identifier: z.string().trim().min(1).max(512),
        displayName: z.string().trim().min(1).max(128).optional(),
    })
    .strict();
const UpdateBody = z
    .object({
        roomId: z.string().url().max(2_048),
        role: RoomRole,
        mode: z.enum(["everyone", "specific", "nobody"]),
        expectedVersion: z.number().int().nonnegative(),
        members: z.array(MemberInput).max(500),
    })
    .strict();

interface PublicRoomUser {
    userId: string;
    identifier: string;
    displayName: string;
}

interface PublicRoomPolicy {
    role: TeapotRoomAccessRole;
    configured: boolean;
    mode: TeapotRoomAccessMode;
    version: number;
    members: PublicRoomUser[];
}

interface PublicRoomVisitor extends PublicRoomUser {
    firstVisitedAt: string;
    lastVisitedAt: string;
    visitCount: number;
    roles: TeapotRoomAccessRole[];
}

interface PublicRoomAccess {
    mapId: string;
    policies: PublicRoomPolicy[];
    visitors: PublicRoomVisitor[];
}

/** Room-admin policy API. Client visibility is convenience; this controller is authoritative. */
export class TeapotRoomEditorAccessController extends BaseHttpController {
    public constructor(
        app: Application,
        private readonly mapUrlResolver: TeapotMapUrlResolver = new AdminTeapotMapUrlResolver(),
    ) {
        super(app);
    }

    protected routes(): void {
        this.app.get("/teapot/rooms/access", authenticated, async (req: Request, res: ResponseWithUserIdentifier) => {
            this.noStore(res);
            const parsed = RoomQuery.safeParse(req.query);
            if (!parsed.success || !res.userIdentifier) {
                res.status(parsed.success ? 401 : 400).json({ error: "invalid_request" });
                return;
            }
            try {
                const mapId = await this.mapUrlResolver.resolve(parsed.data.roomId, req.header("authorization"));
                await this.assertCanManage(req, res, parsed.data.roomId, mapId);
                res.json(await this.toPublicAccess(mapId));
            } catch (error: unknown) {
                this.sendError(res, error);
            }
        });

        this.app.put("/teapot/rooms/access", authenticated, async (req: Request, res: ResponseWithUserIdentifier) => {
            this.noStore(res);
            const parsed = UpdateBody.safeParse(req.body);
            if (!parsed.success || !res.userIdentifier) {
                res.status(parsed.success ? 401 : 400).json({ error: "invalid_request" });
                return;
            }
            try {
                const mapId = await this.mapUrlResolver.resolve(parsed.data.roomId, req.header("authorization"));
                const actor = await this.assertCanManage(req, res, parsed.data.roomId, mapId);
                const services = getTeapotDataServices();
                const existing = await services.repository.getRoomAccessPolicy(mapId, parsed.data.role);
                const uniqueMembers = [
                    ...new Map(parsed.data.members.map((member) => [member.identifier, member])).values(),
                ];
                const resolvedMembers = await Promise.all(
                    uniqueMembers.map(async (member) => ({
                        ...member,
                        identity: await resolveTeapotRequestIdentity(member.identifier, member.displayName),
                    })),
                );
                const updated = await services.repository.replaceRoomAccessPolicy({
                    mapId,
                    role: parsed.data.role,
                    mode: parsed.data.mode,
                    expectedVersion:
                        existing === null && parsed.data.expectedVersion === 0 ? null : parsed.data.expectedVersion,
                    memberIds: resolvedMembers.map(({ identity }) => identity.id),
                    actorId: actor.id,
                });
                await services.repository
                    .appendAuditEvent({
                        actorId: actor.id,
                        action: "room.access.updated",
                        objectType: "map",
                        objectId: mapId,
                        details: {
                            role: parsed.data.role,
                            mode: parsed.data.mode,
                            version: updated.policy.version,
                            memberIds: updated.grants.map((grant) => grant.userId),
                        },
                    })
                    .catch((error: unknown) => console.error("Could not append room access audit event", error));
                res.json(await this.toPublicPolicy(updated));
            } catch (error: unknown) {
                this.sendError(res, error);
            }
        });
    }

    private async assertCanManage(
        req: Request,
        res: ResponseWithUserIdentifier,
        roomId: string,
        mapId: string,
    ): Promise<TeapotIdentity> {
        const identifier = res.userIdentifier;
        if (!identifier) throw new TeapotAuthorizationError("Authentication is required");
        const identity = await resolveTeapotRequestIdentity(identifier, res.username);
        const roomAccess = getTeapotDataServices().roomAccess;
        try {
            await roomAccess.assertCanAdmin({
                actorId: identity.id,
                mapId,
                successfulJoin: false,
                legacyCanAdmin: false,
            });
            return identity;
        } catch (error: unknown) {
            if (!(error instanceof TeapotAuthorizationError)) throw error;
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
        await roomAccess.assertCanAdmin({
            actorId: identity.id,
            mapId,
            successfulJoin: member.status === "ok",
            legacyCanAdmin: member.status === "ok" && member.tags.includes("admin"),
        });
        return identity;
    }

    private async toPublicAccess(mapId: string): Promise<PublicRoomAccess> {
        const services = getTeapotDataServices();
        const roles: TeapotRoomAccessRole[] = ["view", "edit", "admin", "directory"];
        const policies = await Promise.all(
            roles.map(async (role): Promise<PublicRoomPolicy> => {
                const policy = await services.repository.getRoomAccessPolicy(mapId, role);
                if (policy === null) {
                    return {
                        role,
                        configured: false,
                        mode: this.legacyMode(role),
                        version: 0,
                        members: [],
                    };
                }
                return this.toPublicPolicy({
                    policy,
                    grants: await services.repository.listRoomAccessGrants(mapId, role),
                });
            }),
        );
        const grantsByUser = new Map<string, TeapotRoomAccessRole[]>();
        for (const policy of policies) {
            for (const member of policy.members) {
                grantsByUser.set(member.userId, [...(grantsByUser.get(member.userId) ?? []), policy.role]);
            }
        }
        const visitors = await Promise.all(
            (await services.repository.listRoomVisitors(mapId)).map((visitor) =>
                this.toPublicVisitor(visitor, grantsByUser.get(visitor.userId) ?? []),
            ),
        );
        return { mapId, policies, visitors };
    }

    private legacyMode(role: TeapotRoomAccessRole): TeapotRoomAccessMode {
        if (role === "view") return "everyone";
        if (role === "directory") return "everyone";
        if (role === "edit") return MAP_EDITOR_ALLOW_ALL_USERS ? "everyone" : "specific";
        return "specific";
    }

    private async toPublicPolicy(access: TeapotRoomAccessRecord): Promise<PublicRoomPolicy> {
        return {
            role: access.policy.role,
            configured: true,
            mode: access.policy.mode,
            version: access.policy.version,
            members: await Promise.all(access.grants.map((grant) => this.toPublicUser(grant.userId))),
        };
    }

    private async toPublicVisitor(
        visitor: TeapotRoomVisitorRecord,
        roles: TeapotRoomAccessRole[],
    ): Promise<PublicRoomVisitor> {
        return {
            ...(await this.toPublicUser(visitor.userId)),
            firstVisitedAt: visitor.firstVisitedAt,
            lastVisitedAt: visitor.lastVisitedAt,
            visitCount: visitor.visitCount,
            roles,
        };
    }

    private async toPublicUser(userId: string): Promise<PublicRoomUser> {
        const repository = getTeapotDataServices().repository;
        const [identity, providerLink] = await Promise.all([
            repository.getIdentity(userId),
            repository.findProviderLinkForUser(userId, "workadventure"),
        ]);
        const identifier = providerLink?.providerSubject ?? userId;
        return { userId, identifier, displayName: identity?.displayName ?? identifier };
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
        console.error("Room access request failed", error);
        res.status(502).json({ error: "room_access_unavailable" });
    }
}
