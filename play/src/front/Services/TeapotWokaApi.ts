import { z } from "zod";

import { TEAPOT_WOKA_CATEGORIES } from "../../common/Teapot/TeapotWoka";
import type { TeapotWokaCategory } from "../../common/Teapot/TeapotWoka";
import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

const TeapotWokaViewSchema = z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    category: z.enum(TEAPOT_WOKA_CATEGORIES),
    active: z.boolean(),
    createdAt: z.string(),
});

const TeapotWokaListSchema = z.object({
    items: z.array(TeapotWokaViewSchema),
    activeTextureId: z.string().nullable(),
});

export type TeapotWokaView = z.infer<typeof TeapotWokaViewSchema>;
export type TeapotWokaList = z.infer<typeof TeapotWokaListSchema>;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetcher = (input, init) => globalThis.fetch(input, init);

export class TeapotWokaApi {
    constructor(
        private readonly baseUrl: string = ABSOLUTE_PUSHER_URL,
        private readonly tokenProvider: () => string | null = () => localUserStore.getAuthToken(),
        private readonly fetcher: Fetcher = browserFetch,
    ) {}

    async list(): Promise<TeapotWokaList> {
        return TeapotWokaListSchema.parse(await this.request("teapot/wokas"));
    }

    async upload(
        blob: Blob,
        name: string,
        category: TeapotWokaCategory,
        signal?: AbortSignal,
    ): Promise<TeapotWokaView> {
        const url = new URL("teapot/wokas", this.baseUrl);
        url.searchParams.set("name", name);
        url.searchParams.set("category", category);
        return TeapotWokaViewSchema.parse(
            await this.request(url, {
                method: "POST",
                headers: { "Content-Type": "image/png" },
                body: blob,
                signal,
            }),
        );
    }

    async select(textureId: string, signal?: AbortSignal): Promise<TeapotWokaView> {
        return TeapotWokaViewSchema.parse(
            await this.request(`teapot/wokas/${encodeURIComponent(textureId)}/select`, { method: "PUT", signal }),
        );
    }

    async delete(textureId: string, signal?: AbortSignal): Promise<void> {
        await this.request(`teapot/wokas/${encodeURIComponent(textureId)}`, { method: "DELETE", signal });
    }

    private async request(path: string | URL, init: RequestInit = {}): Promise<unknown> {
        const token = this.tokenProvider();
        if (token === null || token.length === 0) {
            throw new Error("Sign in before managing generated avatar assets.");
        }
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

export const teapotWokaApi = new TeapotWokaApi();
