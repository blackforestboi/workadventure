import { z } from "zod";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

export const TeapotMapStyleAssetKindSchema = z.enum([
    "woka",
    "woka-part",
    "map-entity",
    "tileset",
    "reference",
    "terrain-surface",
    "vegetation",
]);
export const TeapotMapStyleSourceSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("teapot-asset"), assetId: z.string(), sourceVersion: z.literal(1) }).strict(),
    z
        .object({
            type: z.literal("built-in"),
            namespace: z.string(),
            key: z.string(),
            sourceVersion: z.number().int().positive(),
        })
        .strict(),
]);
export const TeapotMapStyleViewSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        isDefault: z.boolean(),
        isBuiltIn: z.boolean(),
        createdAt: z.string(),
        updatedAt: z.string(),
    })
    .strict();
export const TeapotMapStyleEntryViewSchema = z
    .object({
        id: z.string(),
        styleId: z.string(),
        assetKind: TeapotMapStyleAssetKindSchema,
        source: TeapotMapStyleSourceSchema,
        metadataVersion: z.number().int().positive(),
        metadata: z.unknown(),
        derivedFromAssetId: z.string().nullable(),
        createdAt: z.string(),
    })
    .strict();
const ListSchema = z
    .object({ styles: z.array(TeapotMapStyleViewSchema), entries: z.array(TeapotMapStyleEntryViewSchema) })
    .strict();

export type TeapotMapStyleView = z.infer<typeof TeapotMapStyleViewSchema>;
export type TeapotMapStyleEntryView = z.infer<typeof TeapotMapStyleEntryViewSchema>;
export type TeapotMapStyleSource = z.infer<typeof TeapotMapStyleSourceSchema>;
export type TeapotMapStyleAssetKind = z.infer<typeof TeapotMapStyleAssetKindSchema>;
export interface TeapotMapStyleListView {
    styles: TeapotMapStyleView[];
    entries: TeapotMapStyleEntryView[];
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetcher = (input, init) => globalThis.fetch(input, init);

export class TeapotMapStyleApi {
    constructor(
        private readonly baseUrl = ABSOLUTE_PUSHER_URL,
        private readonly tokenProvider: () => string | null = () => localUserStore.getAuthToken(),
        private readonly fetcher: Fetcher = browserFetch,
    ) {}

    async list(
        styleId?: string,
        kind?: TeapotMapStyleAssetKind,
        signal?: AbortSignal,
    ): Promise<TeapotMapStyleListView> {
        const url = new URL("teapot/map-styles", this.baseUrl);
        if (styleId !== undefined) url.searchParams.set("styleId", styleId);
        if (kind !== undefined) url.searchParams.set("kind", kind);
        return ListSchema.parse(await this.request(url, { method: "GET", signal }));
    }

    async create(name: string, idempotencyKey: string, signal?: AbortSignal): Promise<TeapotMapStyleView> {
        return TeapotMapStyleViewSchema.parse(
            await this.request("teapot/map-styles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, idempotencyKey }),
                signal,
            }),
        );
    }

    async copy(
        styleId: string,
        source: TeapotMapStyleSource,
        idempotencyKey: string,
        signal?: AbortSignal,
    ): Promise<TeapotMapStyleEntryView> {
        return TeapotMapStyleEntryViewSchema.parse(
            await this.request(`teapot/map-styles/${encodeURIComponent(styleId)}/entries`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source, idempotencyKey }),
                signal,
            }),
        );
    }

    private async request(path: string | URL, init: RequestInit): Promise<unknown> {
        const token = this.tokenProvider();
        if (token === null || token.length === 0) throw new Error("Sign in before managing map styles.");
        const headers = new Headers(init.headers);
        headers.set("Authorization", token);
        const response = await this.fetcher(path instanceof URL ? path : new URL(path, this.baseUrl), {
            ...init,
            headers,
            credentials: "include",
            cache: "no-store",
        });
        const payload = (await response.json().catch(() => undefined)) as { error?: unknown } | undefined;
        if (!response.ok)
            throw new Error(typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`);
        return payload;
    }
}

export const teapotMapStyleApi = new TeapotMapStyleApi();
