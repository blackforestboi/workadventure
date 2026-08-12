import type { AuthTokenData } from "../services/JWTTokenManager";

/**
 * Temporary compatibility seam for the invitation rollout.
 *
 * Keep the admission implementation intact, but do not enforce endorsement
 * state at the world-entry boundary until the rollout resumes.
 */
export class TeapotWorldAdmissionGate {
    async assertTokenCanEnter(_tokenData: AuthTokenData): Promise<void> {}
}
