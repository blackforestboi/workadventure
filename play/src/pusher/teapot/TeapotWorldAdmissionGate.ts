import type { AuthTokenData } from "../services/JWTTokenManager";
import { TeapotAuthorizationError } from "./TeapotDataErrors";
import type { TeapotDataServices } from "./createTeapotDataServices";

/** Socket/HTTP entry seam: call this before admitting an X-authenticated player to a world. */
export class TeapotWorldAdmissionGate {
    constructor(private readonly services: TeapotDataServices) {}

    async assertTokenCanEnter(tokenData: AuthTokenData): Promise<void> {
        if (tokenData.authProvider !== "x") return;
        const identity = await this.services.repository.getIdentity(tokenData.identifier);
        if (identity?.admissionState !== "admitted") {
            throw new TeapotAuthorizationError("Three endorsements are required before entering the world");
        }
        await this.services.authorization.assertCapability(identity.id, "world.enter");
    }
}
