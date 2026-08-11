import type { TeapotCapability } from "../../common/Teapot/TeapotIdentity";
import type { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import { TeapotAuthorizationError } from "./TeapotDataErrors";
import type { TeapotDataRepository } from "./TeapotDataRepository";

export type TeapotRoomEditContext =
    | {
          kind: "wam";
          successfulJoin: boolean;
          legacyCanEdit: boolean;
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

/** Evaluates the current room policy at the final server-side mutation boundary. */
export class TeapotRoomAccessService {
    public constructor(
        private readonly repository: TeapotDataRepository,
        private readonly authorization: TeapotAuthorizationService,
    ) {}

    public async assertCanEdit(input: TeapotRoomEditAccessInput): Promise<void> {
        const identityContext = await this.authorization.getIdentityContext(input.actorId);
        if (identityContext.identity.admissionState === "suspended") {
            throw new TeapotAuthorizationError("Suspended users cannot edit room maps");
        }

        if (identityContext.capabilities.includes("map.manage-any")) {
            return;
        }

        if (
            input.context.kind === "direct" &&
            !identityContext.capabilities.includes(input.context.requiredCapability)
        ) {
            throw new TeapotAuthorizationError(
                `User ${input.actorId} lacks capability ${input.context.requiredCapability}`,
            );
        }

        const policy = await this.repository.getRoomEditorPolicy(input.mapId);
        if (policy === null) {
            if (input.context.kind === "wam" && (!input.context.successfulJoin || !input.context.legacyCanEdit)) {
                throw new TeapotAuthorizationError("The room's legacy editor rules do not allow this user to edit");
            }
            return;
        }

        if (policy.mode === "everyone") {
            if (input.context.kind === "direct" || input.context.successfulJoin) {
                return;
            }
        } else if (policy.mode === "specific") {
            const grants = await this.repository.listRoomEditorGrants(input.mapId);
            if (grants.some((grant) => grant.userId === input.actorId)) {
                return;
            }
        }

        throw new TeapotAuthorizationError(`User ${input.actorId} cannot edit room map ${input.mapId}`);
    }
}
