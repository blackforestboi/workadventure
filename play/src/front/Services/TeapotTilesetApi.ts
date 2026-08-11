import { z } from "zod";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

const TeapotTilesetViewSchema = z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
    createdAt: z.string(),
});
const TeapotTilesetListSchema = z.object({ items: z.array(TeapotTilesetViewSchema) });

export type TeapotTilesetView = z.infer<typeof TeapotTilesetViewSchema>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetcher = (input, init) => globalThis.fetch(input, init);

export class TeapotTilesetApi {
    constructor(
        private readonly baseUrl = ABSOLUTE_PUSHER_URL,
        private readonly tokenProvider: () => string | null = () => localUserStore.getAuthToken(),
        private readonly fetcher: Fetcher = browserFetch,
    ) {}

    async list(): Promise<TeapotTilesetView[]> {
        return TeapotTilesetListSchema.parse(await this.request("teapot/tilesets")).items;
    }

    async upload(
        blob: Blob,
        name: string,
        provenance: { source: "generated" | "imported"; providerId?: string; modelId?: string },
        signal?: AbortSignal,
    ): Promise<TeapotTilesetView> {
        const url = new URL("teapot/tilesets", this.baseUrl);
        url.searchParams.set("name", name);
        url.searchParams.set("source", provenance.source);
        if (provenance.providerId !== undefined) url.searchParams.set("providerId", provenance.providerId);
        if (provenance.modelId !== undefined) url.searchParams.set("modelId", provenance.modelId);
        return TeapotTilesetViewSchema.parse(
            await this.request(url, {
                method: "POST",
                headers: { "Content-Type": "image/png" },
                body: blob,
                signal,
            }),
        );
    }

    private async request(path: string | URL, init: RequestInit = {}): Promise<unknown> {
        const token = this.tokenProvider();
        if (token === null || token.length === 0) throw new Error("Sign in before managing tilesets.");
        const headers = new Headers(init.headers);
        headers.set("Authorization", token);
        const response = await this.fetcher(path instanceof URL ? path : new URL(path, this.baseUrl), {
            ...init,
            headers,
            credentials: "include",
            cache: "no-store",
        });
        const payload = (await response.json().catch(() => undefined)) as { error?: unknown } | undefined;
        if (!response.ok) {
            throw new Error(typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`);
        }
        return payload;
    }
}

export const teapotTilesetApi = new TeapotTilesetApi();
