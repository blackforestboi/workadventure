import { z } from "zod";
import {
    VisualAssetAnimation,
    type VisualAssetAnimation as VisualAssetAnimationValue,
} from "@workadventure/map-editor";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

const TeapotGeneratedAssetViewSchema = z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    kind: z.enum(["map-entity", "reference", "terrain-surface"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    animation: VisualAssetAnimation.optional(),
    surfaceGrid: z
        .object({
            columns: z.literal(5),
            rows: z.literal(5),
            tilePixelSize: z.number().int().positive(),
        })
        .optional(),
    createdAt: z.string(),
});
const TeapotGeneratedAssetListSchema = z.object({ items: z.array(TeapotGeneratedAssetViewSchema) });

export type TeapotGeneratedAssetView = z.infer<typeof TeapotGeneratedAssetViewSchema>;
export type TeapotGeneratedAssetKind = TeapotGeneratedAssetView["kind"];
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetcher = (input, init) => globalThis.fetch(input, init);

export class TeapotGeneratedAssetApi {
    constructor(
        private readonly baseUrl = ABSOLUTE_PUSHER_URL,
        private readonly tokenProvider: () => string | null = () => localUserStore.getAuthToken(),
        private readonly fetcher: Fetcher = browserFetch,
    ) {}

    async upload(
        blob: Blob,
        name: string,
        kind: TeapotGeneratedAssetKind,
        provenance: {
            source: "generated" | "imported";
            providerId?: string;
            modelId?: string;
            animation?: VisualAssetAnimationValue;
            surfaceGrid?: { columns: 5; rows: 5; tilePixelSize: number };
        },
        signal?: AbortSignal,
    ): Promise<TeapotGeneratedAssetView> {
        const url = new URL("teapot/generated-assets", this.baseUrl);
        url.searchParams.set("name", name);
        url.searchParams.set("kind", kind);
        url.searchParams.set("source", provenance.source);
        if (provenance.providerId !== undefined) url.searchParams.set("providerId", provenance.providerId);
        if (provenance.modelId !== undefined) url.searchParams.set("modelId", provenance.modelId);
        if (provenance.animation !== undefined) {
            url.searchParams.set("animation", JSON.stringify(provenance.animation));
        }
        if (provenance.surfaceGrid !== undefined) {
            url.searchParams.set("gridColumns", String(provenance.surfaceGrid.columns));
            url.searchParams.set("gridRows", String(provenance.surfaceGrid.rows));
            url.searchParams.set("tilePixelSize", String(provenance.surfaceGrid.tilePixelSize));
        }
        return TeapotGeneratedAssetViewSchema.parse(
            await this.request(url, {
                method: "POST",
                headers: { "Content-Type": "image/png" },
                body: blob,
                signal,
            }),
        );
    }

    async list(kind: TeapotGeneratedAssetKind, signal?: AbortSignal): Promise<TeapotGeneratedAssetView[]> {
        return TeapotGeneratedAssetListSchema.parse(
            await this.request(`teapot/generated-assets?kind=${encodeURIComponent(kind)}`, { method: "GET", signal }),
        ).items;
    }

    async download(asset: TeapotGeneratedAssetView, signal?: AbortSignal): Promise<Blob> {
        const token = this.tokenProvider();
        const response = await this.fetcher(new URL(asset.url, this.baseUrl), {
            method: "GET",
            signal,
            headers: token === null || token.length === 0 ? undefined : { Authorization: token },
            credentials: "include",
            cache: "no-store",
        });
        if (!response.ok) throw new Error(`Saved asset could not be downloaded (${response.status})`);
        const blob = await response.blob();
        if (blob.type !== "image/png" || blob.size === 0 || blob.size > 8 * 1024 * 1024) {
            throw new Error("Saved asset is not a valid generated PNG");
        }
        return blob;
    }

    private async request(path: string | URL, init: RequestInit): Promise<unknown> {
        const token = this.tokenProvider();
        if (token === null || token.length === 0) throw new Error("Sign in before managing generated assets.");
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

export const teapotGeneratedAssetApi = new TeapotGeneratedAssetApi();
