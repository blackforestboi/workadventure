import { z } from "zod";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

export type HostedAgentProvider = "codex" | "claude";

const HostedAgentConnectionStartSchema = z.object({
    pairingId: z.string().min(1),
    authorizationUrl: z.string().url(),
    mode: z.enum(["device-code", "authorization-code"]),
    userCode: z.string().min(1).optional(),
});

const HostedAgentConnectionStatusSchema = z.object({
    state: z.enum(["pending", "connected", "failed", "expired"]),
    message: z.string().optional(),
});
const HostedAgentConnectionSchema = z.object({
    connected: z.boolean(),
});

export type HostedAgentConnectionStart = z.infer<typeof HostedAgentConnectionStartSchema>;
export type HostedAgentConnectionStatus = z.infer<typeof HostedAgentConnectionStatusSchema>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class HostedAgentConnectionApi {
    public constructor(
        private readonly baseUrl = ABSOLUTE_PUSHER_URL,
        private readonly tokenProvider: () => string | null = () => localUserStore.getAuthToken(),
        // `window.fetch` requires the Window receiver in some browsers. Passing the
        // bare function here makes OAuth setup fail before any request is sent.
        private readonly fetcher: Fetcher = (input, init) => globalThis.fetch(input, init),
    ) {}

    public async start(provider: HostedAgentProvider, signal?: AbortSignal): Promise<HostedAgentConnectionStart> {
        return HostedAgentConnectionStartSchema.parse(
            await this.request(`teapot/ai/providers/${provider}/oauth/start`, { method: "POST", signal }),
        );
    }

    public async status(
        provider: HostedAgentProvider,
        pairingId: string,
        signal?: AbortSignal,
    ): Promise<HostedAgentConnectionStatus> {
        const url = new URL(`teapot/ai/providers/${provider}/oauth/status`, this.baseUrl);
        url.searchParams.set("pairingId", pairingId);
        return HostedAgentConnectionStatusSchema.parse(await this.request(url, { signal }));
    }

    public async complete(
        provider: HostedAgentProvider,
        pairingId: string,
        code: string,
        signal?: AbortSignal,
    ): Promise<HostedAgentConnectionStatus> {
        return HostedAgentConnectionStatusSchema.parse(
            await this.request(`teapot/ai/providers/${provider}/oauth/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pairingId, code }),
                signal,
            }),
        );
    }

    public async connection(provider: HostedAgentProvider, signal?: AbortSignal): Promise<boolean> {
        return HostedAgentConnectionSchema.parse(
            await this.request(`teapot/ai/providers/${provider}/connection`, { signal }),
        ).connected;
    }

    public async disconnect(provider: HostedAgentProvider, signal?: AbortSignal): Promise<void> {
        await this.request(`teapot/ai/providers/${provider}/connection`, { method: "DELETE", signal });
    }

    private async request(path: string | URL, init: RequestInit): Promise<unknown> {
        const token = this.tokenProvider();
        if (token === null || token.length === 0) throw new Error("Sign in before connecting an AI subscription.");
        const headers = new Headers(init.headers);
        headers.set("Authorization", token);
        const response = await this.fetcher(path instanceof URL ? path : new URL(path, this.baseUrl), {
            ...init,
            headers,
            credentials: "include",
            cache: "no-store",
        });
        if (response.status === 204) return undefined;
        const payload = (await response.json().catch(() => undefined)) as { error?: unknown } | undefined;
        if (!response.ok) {
            throw new Error(typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`);
        }
        return payload;
    }
}

export const hostedAgentConnectionApi = new HostedAgentConnectionApi();
