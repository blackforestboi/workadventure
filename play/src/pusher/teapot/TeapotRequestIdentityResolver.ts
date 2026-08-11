import { MAP_EDITOR_ALLOWED_USERS, MAP_EDITOR_ALLOW_ALL_USERS } from "../enums/EnvironmentVariable";
import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import { getTeapotDataServices } from "./TeapotDataRuntime";
import { isTeapotIdentityId } from "./TeapotOwnerIdentityResolver";

/** Maps the existing WorkAdventure JWT identifier onto Teapot's stable identity boundary. */
export async function resolveTeapotRequestIdentity(identifier: string): Promise<TeapotIdentity> {
    const services = getTeapotDataServices();
    if (isTeapotIdentityId(identifier)) {
        const internalIdentity = await services.repository.getIdentity(identifier);
        if (internalIdentity !== null) return internalIdentity;
    }

    const identity = await services.identity.resolveProviderIdentity({
        provider: "workadventure",
        providerSubject: identifier,
    });
    if (MAP_EDITOR_ALLOW_ALL_USERS || MAP_EDITOR_ALLOWED_USERS.includes(identifier)) {
        await services.repository.addRole(identity.id, "creator");
    }
    return identity;
}
