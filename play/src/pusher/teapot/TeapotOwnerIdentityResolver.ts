import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import type { TeapotIdentityService } from "./TeapotIdentityService";

const TEAPOT_IDENTITY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TEAPOT_WORKADVENTURE_IDENTITY_PROVIDER = "workadventure-jwt";

/** Teapot user IDs are UUIDs, while WorkAdventure provider subjects can be arbitrary strings such as email addresses. */
export function isTeapotIdentityId(value: string): boolean {
    return TEAPOT_IDENTITY_ID_PATTERN.test(value);
}

export async function resolveTeapotOwnerIdentity(
    repository: TeapotDataRepository,
    identityService: TeapotIdentityService,
    providerSubject: string,
    identityProvider: string,
): Promise<TeapotIdentity> {
    if (isTeapotIdentityId(providerSubject)) {
        const existing = await repository.getIdentity(providerSubject);
        if (existing !== null) return existing;
    }
    return identityService.resolveProviderIdentity({ provider: identityProvider, providerSubject });
}
