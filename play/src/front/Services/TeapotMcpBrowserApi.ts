import type {
    TeapotMcpProposal,
    TeapotMcpProposalState,
    TeapotMcpSessionCredential,
    TeapotPaidGenerationClaim,
    TeapotPaidGenerationCompletionResult,
} from "@workadventure/teapot-mcp/contracts";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export class TeapotMcpBrowserApiError extends Error {
    constructor(
        message: string,
        readonly statusCode: number,
    ) {
        super(message);
        this.name = "TeapotMcpBrowserApiError";
    }
}

export interface TeapotMcpBrowserProposal extends TeapotMcpProposal {
    approvalToken?: string;
}

export class TeapotMcpBrowserApi {
    constructor(
        private readonly baseUrl: string = ABSOLUTE_PUSHER_URL,
        private readonly getAuthToken: () => string | null = () =>
            new URL(window.location.href).searchParams.get("token") ?? localUserStore.getAuthToken(),
        private readonly fetcher: typeof fetch = browserFetch,
    ) {}

    createSession(clientName: string, signal?: AbortSignal): Promise<TeapotMcpSessionCredential> {
        return this.request("teapot/mcp/browser/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientName }),
            signal,
        });
    }

    revokeSession(sessionId: string, signal?: AbortSignal): Promise<void> {
        return this.requestNoContent(`teapot/mcp/browser/sessions/${encodeURIComponent(sessionId)}`, signal);
    }

    listProposals(state?: TeapotMcpProposalState, signal?: AbortSignal): Promise<TeapotMcpBrowserProposal[]> {
        const query = state === undefined ? "" : `?state=${encodeURIComponent(state)}`;
        return this.request(`teapot/mcp/browser/proposals${query}`, { method: "GET", signal });
    }

    getProposal(proposalId: string, signal?: AbortSignal): Promise<TeapotMcpBrowserProposal> {
        return this.request(`teapot/mcp/browser/proposals/${encodeURIComponent(proposalId)}`, {
            method: "GET",
            signal,
        });
    }

    approve(proposalId: string, signal?: AbortSignal): Promise<TeapotMcpBrowserProposal> {
        return this.request(`teapot/mcp/browser/proposals/${encodeURIComponent(proposalId)}/approve`, {
            method: "POST",
            signal,
        });
    }

    deny(proposalId: string, signal?: AbortSignal): Promise<TeapotMcpProposal> {
        return this.request(`teapot/mcp/browser/proposals/${encodeURIComponent(proposalId)}/deny`, {
            method: "POST",
            signal,
        });
    }

    claimPaidGeneration(
        proposalId: string,
        approvalToken: string,
        signal?: AbortSignal,
    ): Promise<TeapotPaidGenerationClaim> {
        return this.request(`teapot/mcp/browser/proposals/${encodeURIComponent(proposalId)}/claim-paid-generation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ approvalToken }),
            signal,
        });
    }

    completePaidGeneration(
        proposalId: string,
        approvalToken: string,
        result: TeapotPaidGenerationCompletionResult,
        signal?: AbortSignal,
    ): Promise<TeapotMcpProposal> {
        return this.request(`teapot/mcp/browser/proposals/${encodeURIComponent(proposalId)}/complete-paid-generation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ approvalToken, result }),
            signal,
        });
    }

    private async request<T>(path: string, init: RequestInit): Promise<T> {
        const authToken = this.getAuthToken();
        if (!authToken) throw new TeapotMcpBrowserApiError("Log in before connecting an AI agent", 401);
        const headers = new Headers(init.headers);
        headers.set("Authorization", authToken);
        headers.set("Accept", "application/json");
        const response = await this.fetcher(new URL(path, this.baseUrl), {
            ...init,
            headers,
            cache: "no-store",
        });
        if (!response.ok) {
            const body: unknown = await response.json().catch(() => undefined);
            throw new TeapotMcpBrowserApiError(
                readError(body) ?? `Request failed (${response.status})`,
                response.status,
            );
        }
        return response.json();
    }

    private async requestNoContent(path: string, signal?: AbortSignal): Promise<void> {
        const authToken = this.getAuthToken();
        if (!authToken) throw new TeapotMcpBrowserApiError("Log in before connecting an AI agent", 401);
        const response = await this.fetcher(new URL(path, this.baseUrl), {
            method: "DELETE",
            headers: { Authorization: authToken },
            signal,
            cache: "no-store",
        });
        if (!response.ok) {
            const body: unknown = await response.json().catch(() => undefined);
            throw new TeapotMcpBrowserApiError(
                readError(body) ?? `Request failed (${response.status})`,
                response.status,
            );
        }
    }
}

function readError(value: unknown): string | undefined {
    if (typeof value !== "object" || value === null || !("error" in value)) return undefined;
    return typeof value.error === "string" ? value.error : undefined;
}

export const teapotMcpBrowserApi = new TeapotMcpBrowserApi();
