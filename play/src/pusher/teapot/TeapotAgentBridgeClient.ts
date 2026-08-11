import { createHash } from "node:crypto";

export type TeapotHostedAgentProvider = "codex" | "claude";

export interface TeapotHostedOAuthStart {
    pairingId: string;
    authorizationUrl: string;
    mode: "device-code" | "authorization-code";
    userCode?: string;
    expiresAt?: string;
}

export interface TeapotHostedOAuthStatus {
    state: "pending" | "connected" | "failed" | "expired";
    message?: string;
}

export interface TeapotHostedModel {
    id: string;
    name: string;
    description?: string;
}

interface TeapotHostedCapabilities {
    connected: boolean;
}

export class TeapotAgentBridgeError extends Error {
    public constructor(
        message: string,
        public readonly status: number,
    ) {
        super(message);
    }
}

export class TeapotAgentBridgeClient {
    private readonly baseUrl: string;

    public constructor(
        baseUrl: string,
        private readonly serviceSecret: string,
        private readonly fetcher: typeof fetch = fetch,
    ) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }

    public async startOAuth(owner: string, provider: TeapotHostedAgentProvider): Promise<TeapotHostedOAuthStart> {
        const payload = await this.request<unknown>(owner, `/v1/oauth/${provider}/start`, { method: "POST" });
        return normalizeOAuthStart(provider, payload);
    }

    public oauthStatus(
        owner: string,
        provider: TeapotHostedAgentProvider,
        pairingId: string,
    ): Promise<TeapotHostedOAuthStatus> {
        return this.request(owner, `/v1/oauth/${provider}/status?pairingId=${encodeURIComponent(pairingId)}`);
    }

    public completeOAuth(
        owner: string,
        provider: TeapotHostedAgentProvider,
        pairingId: string,
        code: string,
    ): Promise<TeapotHostedOAuthStatus> {
        return this.request(owner, `/v1/oauth/${provider}/complete`, {
            method: "POST",
            body: JSON.stringify({ pairingId, code }),
        });
    }

    public async disconnect(owner: string, provider: TeapotHostedAgentProvider): Promise<void> {
        await this.request(owner, `/v1/oauth/${provider}/connection`, { method: "DELETE" });
    }

    public async isConnected(owner: string, provider: TeapotHostedAgentProvider): Promise<boolean> {
        const payload = await this.request<unknown>(owner, `/v1/providers/${provider}/capabilities`);
        if (
            typeof payload !== "object" ||
            payload === null ||
            Array.isArray(payload) ||
            typeof (payload as TeapotHostedCapabilities).connected !== "boolean"
        ) {
            throw new TeapotAgentBridgeError("The hosted AI connection service returned an invalid response", 502);
        }
        return (payload as TeapotHostedCapabilities).connected;
    }

    public async listModels(owner: string, provider: TeapotHostedAgentProvider): Promise<readonly TeapotHostedModel[]> {
        const payload = await this.request<{ models: unknown }>(owner, `/v1/providers/${provider}/models`);
        return normalizeModels(payload.models);
    }

    public generate(owner: string, provider: TeapotHostedAgentProvider, body: unknown): Promise<unknown> {
        return this.request(owner, `/v1/providers/${provider}/generate`, {
            method: "POST",
            body: JSON.stringify(body),
        });
    }

    private async request<T = unknown>(owner: string, path: string, init: RequestInit = {}): Promise<T> {
        if (this.baseUrl === "" || this.serviceSecret === "") {
            throw new TeapotAgentBridgeError("Hosted AI connections are not configured", 503);
        }
        let response: Response;
        try {
            response = await this.fetcher(`${this.baseUrl}${path}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${this.serviceSecret}`,
                    "Content-Type": "application/json",
                    "X-Teapot-Owner": stableOwnerId(owner),
                    ...init.headers,
                },
                cache: "no-store",
            });
        } catch {
            throw new TeapotAgentBridgeError("The hosted AI connection service could not be reached", 502);
        }
        if (!response.ok) {
            const message = await readSafeError(response);
            throw new TeapotAgentBridgeError(
                message,
                response.status >= 400 && response.status < 600 ? response.status : 502,
            );
        }
        if (response.status === 204) return undefined as T;
        try {
            return (await response.json()) as T;
        } catch {
            throw new TeapotAgentBridgeError("The hosted AI connection service returned an invalid response", 502);
        }
    }
}

function normalizeOAuthStart(provider: TeapotHostedAgentProvider, payload: unknown): TeapotHostedOAuthStart {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new TeapotAgentBridgeError("The hosted AI connection service returned an invalid response", 502);
    }
    const value = payload as Record<string, unknown>;
    const pairingId = value.pairingId;
    const authorizationUrl = provider === "codex" ? value.verificationUrl : value.authorizationUrl;
    const mode = provider === "codex" ? "device-code" : value.mode;
    if (
        typeof pairingId !== "string" ||
        pairingId.length === 0 ||
        typeof authorizationUrl !== "string" ||
        authorizationUrl.length === 0 ||
        (mode !== "device-code" && mode !== "authorization-code")
    ) {
        throw new TeapotAgentBridgeError("The hosted AI connection service returned an invalid response", 502);
    }
    return {
        pairingId,
        authorizationUrl,
        mode,
        ...(typeof value.userCode === "string" && value.userCode.length > 0 ? { userCode: value.userCode } : {}),
        ...(typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {}),
    };
}

function normalizeModels(payload: unknown): readonly TeapotHostedModel[] {
    if (!Array.isArray(payload)) {
        throw new TeapotAgentBridgeError("The hosted AI connection service returned invalid models", 502);
    }
    return payload.map((candidate) => {
        if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
            throw new TeapotAgentBridgeError("The hosted AI connection service returned invalid models", 502);
        }
        const model = candidate as Record<string, unknown>;
        const modelId = typeof model.model === "string" && model.model.length > 0 ? model.model : model.id;
        const name = typeof model.name === "string" ? model.name : model.displayName;
        if (typeof modelId !== "string" || modelId.length === 0 || typeof name !== "string" || name.length === 0) {
            throw new TeapotAgentBridgeError("The hosted AI connection service returned invalid models", 502);
        }
        return {
            id: modelId,
            name,
            ...(typeof model.description === "string" ? { description: model.description } : {}),
        };
    });
}

function stableOwnerId(owner: string): string {
    return createHash("sha256").update(owner).digest("base64url");
}

async function readSafeError(response: Response): Promise<string> {
    try {
        const payload: unknown = await response.json();
        if (
            typeof payload === "object" &&
            payload !== null &&
            !Array.isArray(payload) &&
            "error" in payload &&
            typeof payload.error === "string" &&
            payload.error.length <= 300
        ) {
            return payload.error;
        }
    } catch {
        // Fall through to the bounded generic message.
    }
    return "The hosted AI connection request failed";
}
