import { z } from "zod";

import { TeapotOAuthError } from "./TeapotDataErrors";

const XTokenResponse = z.object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
});

const XUserResponse = z.object({
    data: z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        username: z.string().optional(),
    }),
});

export interface XOAuthUser {
    id: string;
    name?: string;
    username?: string;
}

export interface XOAuthClientOptions {
    clientId: string;
    clientSecret?: string;
    fetch?: typeof fetch;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    userEndpoint?: string;
    revocationEndpoint?: string;
}

export class XOAuthClient {
    private readonly request: typeof fetch;
    private readonly authorizationEndpoint: string;
    private readonly tokenEndpoint: string;
    private readonly userEndpoint: string;
    private readonly revocationEndpoint: string;

    constructor(private readonly options: XOAuthClientOptions) {
        this.request = options.fetch ?? fetch;
        this.authorizationEndpoint = options.authorizationEndpoint ?? "https://x.com/i/oauth2/authorize";
        this.tokenEndpoint = options.tokenEndpoint ?? "https://api.x.com/2/oauth2/token";
        this.userEndpoint = options.userEndpoint ?? "https://api.x.com/2/users/me";
        this.revocationEndpoint = options.revocationEndpoint ?? "https://api.x.com/2/oauth2/revoke";
    }

    createAuthorizationUrl(state: string, codeChallenge: string, redirectUri: string): string {
        const url = new URL(this.authorizationEndpoint);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", this.options.clientId);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("scope", "tweet.read users.read");
        url.searchParams.set("state", state);
        url.searchParams.set("code_challenge", codeChallenge);
        url.searchParams.set("code_challenge_method", "S256");
        return url.toString();
    }

    async exchangeAuthorizationCode(code: string, codeVerifier: string, redirectUri: string): Promise<string> {
        const body = new URLSearchParams({
            code,
            grant_type: "authorization_code",
            client_id: this.options.clientId,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        });
        const response = await this.request(this.tokenEndpoint, {
            method: "POST",
            headers: this.formHeaders(),
            body,
        });
        if (!response.ok) {
            throw new TeapotOAuthError(`X authorization code exchange failed with status ${response.status}`);
        }
        const parsed = XTokenResponse.safeParse(await response.json());
        if (!parsed.success) throw new TeapotOAuthError("X returned an invalid token response");
        return parsed.data.access_token;
    }

    async getCurrentUser(accessToken: string): Promise<XOAuthUser> {
        const url = new URL(this.userEndpoint);
        url.searchParams.set("user.fields", "name,username");
        const response = await this.request(url, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (!response.ok) throw new TeapotOAuthError(`X user lookup failed with status ${response.status}`);
        const parsed = XUserResponse.safeParse(await response.json());
        if (!parsed.success) throw new TeapotOAuthError("X returned an invalid user response");
        return parsed.data.data;
    }

    async revokeAccessToken(accessToken: string): Promise<void> {
        const response = await this.request(this.revocationEndpoint, {
            method: "POST",
            headers: this.formHeaders(),
            body: new URLSearchParams({
                token: accessToken,
                token_type_hint: "access_token",
                client_id: this.options.clientId,
            }),
        });
        if (!response.ok) throw new TeapotOAuthError(`X token revocation failed with status ${response.status}`);
    }

    private formHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        };
        if (this.options.clientSecret !== undefined) {
            headers.Authorization = `Basic ${Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString("base64")}`;
        }
        return headers;
    }
}
