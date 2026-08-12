import type { AuthTokenData } from "../services/JWTTokenManager";
import { isTeapotInvitationAdmissionEnforced } from "./TeapotInvitationAdmissionPolicy";

/**
 * Temporary compatibility seam for the invitation rollout.
 *
 * Keep the admission implementation intact, but do not enforce endorsement
 * state at the world-entry boundary until the rollout resumes.
 */
export class TeapotWorldAdmissionGate {
    async assertTokenCanEnter(_tokenData: AuthTokenData): Promise<void> {
        if (!isTeapotInvitationAdmissionEnforced()) return;

        // The invitation gate implementation remains available for the rollout.
    }
}
