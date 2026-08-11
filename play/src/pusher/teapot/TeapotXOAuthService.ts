import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import type { JWTTokenManager } from "../services/JWTTokenManager";
import { TeapotOAuthError } from "./TeapotDataErrors";
import type { TeapotDataServices } from "./createTeapotDataServices";
import { createPkceChallenge, generateOpaqueToken, hashOpaqueToken } from "./TeapotTokenSecurity";
import type { TeapotSecretBox } from "./TeapotTokenSecurity";
import type { XOAuthUser } from "./XOAuthClient";
import type { XOAuthClient } from "./XOAuthClient";

export interface TeapotXOAuthServiceOptions {
    clientId: string;
    redirectUri: string;
    frontUrl: string;
    bootstrapXUserIds?: readonly string[];
    now?: () => Date;
    stateTtlMs?: number;
    createToken?: () => string;
}

export interface TeapotXOAuthCallbackResult {
    identity: TeapotIdentity;
    redirectTo: string;
}

export class TeapotXOAuthService {
    private readonly now: () => Date;
    private readonly stateTtlMs: number;
    private readonly createToken: () => string;
    private readonly bootstrapXUserIds: ReadonlySet<string>;

    constructor(
        private readonly services: TeapotDataServices,
        private readonly jwtTokenManager: JWTTokenManager,
        private readonly xClient: XOAuthClient,
        private readonly secretBox: TeapotSecretBox,
        private readonly options: TeapotXOAuthServiceOptions,
    ) {
        this.now = options.now ?? (() => new Date());
        this.stateTtlMs = options.stateTtlMs ?? 5 * 60 * 1_000;
        this.createToken = options.createToken ?? generateOpaqueToken;
        this.bootstrapXUserIds = new Set(options.bootstrapXUserIds ?? []);
    }

    async begin(returnTo?: string): Promise<string> {
        this.assertConfigured();
        const now = this.now();
        const state = this.createToken();
        const codeVerifier = this.createToken();
        const safeReturnTo = this.validateReturnTo(returnTo);
        await this.services.repository.createOAuthState({
            stateHash: hashOpaqueToken(state),
            encryptedCodeVerifier: this.secretBox.encrypt(codeVerifier),
            redirectUri: this.options.redirectUri,
            returnTo: safeReturnTo,
            expiresAt: new Date(now.getTime() + this.stateTtlMs).toISOString(),
        });
        return this.xClient.createAuthorizationUrl(state, createPkceChallenge(codeVerifier), this.options.redirectUri);
    }

    isConfigured(): boolean {
        return Boolean(this.options.clientId && this.options.redirectUri && this.options.frontUrl);
    }

    async complete(code: string, state: string): Promise<TeapotXOAuthCallbackResult> {
        this.assertConfigured();
        const oauthState = await this.services.repository.consumeOAuthState(
            hashOpaqueToken(state),
            this.now().toISOString(),
        );
        if (oauthState === null || oauthState.redirectUri !== this.options.redirectUri) {
            throw new TeapotOAuthError("X sign-in state is invalid, expired, or already used");
        }

        let codeVerifier: string;
        try {
            codeVerifier = this.secretBox.decrypt(oauthState.encryptedCodeVerifier);
        } catch {
            throw new TeapotOAuthError("X sign-in state could not be verified");
        }

        let user: XOAuthUser;
        const accessToken = await this.xClient.exchangeAuthorizationCode(code, codeVerifier, oauthState.redirectUri);
        try {
            user = await this.xClient.getCurrentUser(accessToken);
        } finally {
            await this.xClient.revokeAccessToken(accessToken).catch(() => undefined);
        }

        let identity = await this.services.identity.resolveProviderIdentity({
            provider: "x",
            providerSubject: user.id,
            displayName: this.displayName(user),
        });
        if (this.bootstrapXUserIds.has(user.id)) {
            identity = await this.services.repository.updateAdmissionState(identity.id, "admitted");
            await this.services.repository.addRole(identity.id, "operator");
        }
        const authToken = await this.jwtTokenManager.createAuthToken(
            identity.id,
            undefined,
            identity.displayName ?? undefined,
            undefined,
            undefined,
            undefined,
            "x",
        );
        const redirect = new URL(oauthState.returnTo);
        redirect.searchParams.set("token", authToken);
        await this.services.repository.appendAuditEvent({
            actorId: identity.id,
            action: "identity.x-signed-in",
            objectType: "identity",
            objectId: identity.id,
        });
        return { identity, redirectTo: redirect.toString() };
    }

    private validateReturnTo(returnTo?: string): string {
        if (!this.options.frontUrl) throw new TeapotOAuthError("Teapot X sign-in is not configured");
        const front = new URL(this.options.frontUrl);
        const target = new URL(returnTo ?? front.toString(), front);
        const fragment = new URLSearchParams(target.hash.slice(1));
        if (
            target.origin !== front.origin ||
            target.username ||
            target.password ||
            target.searchParams.has("token") ||
            target.searchParams.has("teapotInvite") ||
            fragment.has("teapotInvite") ||
            target.toString().length > 2_048
        ) {
            throw new TeapotOAuthError("X sign-in return URL is not allowed");
        }
        return target.toString();
    }

    private assertConfigured(): void {
        if (!this.isConfigured()) {
            throw new TeapotOAuthError("Teapot X sign-in is not configured");
        }
    }

    private displayName(user: XOAuthUser): string | undefined {
        return user.name?.trim() || (user.username ? `@${user.username}` : undefined);
    }
}
