import type { TeapotCapability } from "../../common/Teapot/TeapotIdentity";
import type { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import { TeapotAuthorizationError } from "./TeapotDataErrors";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import type { TeapotRoomAccessRole } from "./TeapotRecords";

export type TeapotRoomEditContext =
    | {
          kind: "wam";
          successfulJoin: boolean;
          legacyCanEdit: boolean;
          legacyCanAdmin?: boolean;
          temporaryRootEditor?: boolean;
          isLogged: boolean;
      }
    | {
          kind: "direct";
          requiredCapability: TeapotCapability;
      };

export interface TeapotRoomEditAccessInput {
    actorId: string;
    mapId: string;
    context: TeapotRoomEditContext;
}

export interface TeapotRoomJoinAccessInput {
    actorId: string;
    mapId: string;
    successfulJoin: boolean;
    legacyCanEdit: boolean;
    legacyCanAdmin: boolean;
}

export interface TeapotRoomAdminAccessInput {
    actorId: string;
    mapId: string;
    successfulJoin: boolean;
    legacyCanAdmin: boolean;
}

/** Evaluates room policy at the server boundary. Higher roles include lower-role privileges. */
export class TeapotRoomAccessService {
    public constructor(
        private readonly repository: TeapotDataRepository,
        private readonly authorization: TeapotAuthorizationService,
        private readonly allowAllSignedInWamEditors = true,
    ) {}

    public async assertCanView(input: TeapotRoomJoinAccessInput): Promise<void> {
        await this.assertActiveIdentity(input.actorId, "view rooms");
        if (await this.hasPlatformOverride(input.actorId)) return;
        if (input.legacyCanAdmin) return;

        if (
            (await this.roleAllows(input.actorId, input.mapId, "admin", input.successfulJoin)) ||
            (await this.roleAllows(input.actorId, input.mapId, "edit", input.successfulJoin))
        ) {
            return;
        }

        const policy = await this.repository.getRoomAccessPolicy(input.mapId, "view");
        if (policy === null) {
            if (input.successfulJoin) return;
        } else if (await this.policyAllows(input.actorId, input.mapId, "view", policy.mode, input.successfulJoin)) {
            return;
        }
        throw new TeapotAuthorizationError(`User ${input.actorId} cannot view room map ${input.mapId}`);
    }

    public async assertCanEdit(input: TeapotRoomEditAccessInput): Promise<void> {
        const identityContext = await this.assertActiveIdentity(input.actorId, "edit room maps");
        if (identityContext.capabilities.includes("map.manage-any")) return;

        if (
            input.context.kind === "direct" &&
            !identityContext.capabilities.includes(input.context.requiredCapability)
        ) {
            throw new TeapotAuthorizationError(
                `User ${input.actorId} lacks capability ${input.context.requiredCapability}`,
            );
        }

        if (
            this.allowAllSignedInWamEditors &&
            input.context.kind === "wam" &&
            input.context.successfulJoin &&
            input.context.isLogged
        ) {
            return;
        }

        if (input.context.kind === "wam" && input.context.legacyCanAdmin) return;
        if (input.context.kind === "wam" && input.context.temporaryRootEditor) return;
        const everyoneEligible =
            input.context.kind === "direct" ||
            (input.context.successfulJoin &&
                (input.context.isLogged || input.context.legacyCanEdit || input.context.temporaryRootEditor === true));
        if (await this.roleAllows(input.actorId, input.mapId, "admin", everyoneEligible)) return;

        const policy = await this.repository.getRoomAccessPolicy(input.mapId, "edit");
        if (policy === null) {
            if (everyoneEligible) return;
        } else if (await this.policyAllows(input.actorId, input.mapId, "edit", policy.mode, everyoneEligible)) {
            return;
        }
        throw new TeapotAuthorizationError(`User ${input.actorId} cannot edit room map ${input.mapId}`);
    }

    public async assertCanAdmin(input: TeapotRoomAdminAccessInput): Promise<void> {
        await this.assertActiveIdentity(input.actorId, "administer rooms");
        if (await this.hasPlatformOverride(input.actorId)) return;
        if (input.legacyCanAdmin) return;

        const policy = await this.repository.getRoomAccessPolicy(input.mapId, "admin");
        if (
            policy !== null &&
            (await this.policyAllows(input.actorId, input.mapId, "admin", policy.mode, input.successfulJoin))
        ) {
            return;
        }
        throw new TeapotAuthorizationError(`User ${input.actorId} cannot administer room map ${input.mapId}`);
    }

    private async roleAllows(
        actorId: string,
        mapId: string,
        role: TeapotRoomAccessRole,
        everyoneEligible: boolean,
    ): Promise<boolean> {
        const policy = await this.repository.getRoomAccessPolicy(mapId, role);
        return policy !== null && this.policyAllows(actorId, mapId, role, policy.mode, everyoneEligible);
    }

    private async policyAllows(
        actorId: string,
        mapId: string,
        role: TeapotRoomAccessRole,
        mode: "everyone" | "specific" | "nobody",
        everyoneEligible: boolean,
    ): Promise<boolean> {
        if (mode === "everyone") return everyoneEligible;
        if (mode === "nobody") return false;
        const grants = await this.repository.listRoomAccessGrants(mapId, role);
        return grants.some((grant) => grant.userId === actorId);
    }

    private async assertActiveIdentity(actorId: string, action: string) {
        const identityContext = await this.authorization.getIdentityContext(actorId);
        if (identityContext.identity.admissionState === "suspended") {
            throw new TeapotAuthorizationError(`Suspended users cannot ${action}`);
        }
        return identityContext;
    }

    private async hasPlatformOverride(actorId: string): Promise<boolean> {
        return this.authorization.hasCapability(actorId, "map.manage-any");
    }
}
