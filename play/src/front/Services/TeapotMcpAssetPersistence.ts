import type {
    TeapotPaidGenerationCompletionResult,
    TeapotPaidGenerationRequest,
} from "@workadventure/teapot-mcp/contracts";
import type { VisualAssetAnimation } from "@workadventure/map-editor";

import type { TeapotWokaCategory } from "../../common/Teapot/TeapotWoka";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";
import { teapotGeneratedAssetApi, type TeapotGeneratedAssetApi } from "./TeapotGeneratedAssetApi";
import { teapotTilesetApi, type TeapotTilesetApi } from "./TeapotTilesetApi";
import { teapotWokaApi, type TeapotWokaApi } from "./TeapotWokaApi";

interface GeneratedCandidate {
    blob: Blob;
    providerId: "openrouter" | "codex-cli" | "claude-cli";
    modelId: string;
    animation?: VisualAssetAnimation;
}

export class TeapotMcpAssetPersistence {
    constructor(
        private readonly wokaApi: Pick<TeapotWokaApi, "upload"> = teapotWokaApi,
        private readonly tilesetApi: Pick<TeapotTilesetApi, "upload"> = teapotTilesetApi,
        private readonly generatedAssetApi: Pick<TeapotGeneratedAssetApi, "upload"> = teapotGeneratedAssetApi,
        private readonly publicBaseUrl = ABSOLUTE_PUSHER_URL,
    ) {}

    async persist(
        request: TeapotPaidGenerationRequest,
        candidate: GeneratedCandidate,
        signal?: AbortSignal,
    ): Promise<TeapotPaidGenerationCompletionResult> {
        if (candidate.blob.type !== "image/png" || candidate.blob.size === 0) {
            throw new Error("Only a non-empty browser-normalized PNG can be saved for an MCP proposal");
        }
        const name = assetName(request.targetAssetClass);
        const provenance = {
            source: "generated" as const,
            providerId: candidate.providerId,
            modelId: candidate.modelId,
            ...(candidate.animation === undefined ? {} : { animation: candidate.animation }),
        };

        switch (request.purpose) {
            case "avatar": {
                const saved = await this.wokaApi.upload(candidate.blob, name, "woka", signal);
                return completion(
                    candidate,
                    rawWokaAssetId(saved.id),
                    absoluteUrl(saved.url, this.publicBaseUrl),
                    "woka",
                );
            }
            case "avatar-part": {
                const saved = await this.wokaApi.upload(
                    candidate.blob,
                    name,
                    wokaCategory(request.targetAssetClass),
                    signal,
                );
                return completion(
                    candidate,
                    rawWokaAssetId(saved.id),
                    absoluteUrl(saved.url, this.publicBaseUrl),
                    "woka-part",
                );
            }
            case "tileset": {
                const saved = await this.tilesetApi.upload(candidate.blob, name, provenance, signal);
                return completion(candidate, saved.id, absoluteUrl(saved.url, this.publicBaseUrl), "tileset");
            }
            case "map-entity":
            case "reference": {
                const saved = await this.generatedAssetApi.upload(
                    candidate.blob,
                    name,
                    request.purpose,
                    provenance,
                    signal,
                );
                return completion(candidate, saved.id, absoluteUrl(saved.url, this.publicBaseUrl), request.purpose);
            }
            default: {
                const exhaustive: never = request.purpose;
                throw new Error(`Unsupported generation purpose: ${String(exhaustive)}`);
            }
        }
    }
}

function completion(
    candidate: GeneratedCandidate,
    assetId: string,
    assetUrl: string,
    assetKind: "woka" | "woka-part" | "tileset" | "map-entity" | "reference",
): TeapotPaidGenerationCompletionResult {
    return {
        status: "accepted-asset",
        assetId,
        assetUrl,
        assetKind,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        mediaType: "image/png",
        byteLength: candidate.blob.size,
    };
}

function rawWokaAssetId(textureId: string): string {
    const prefix = "teapot-woka:";
    if (!textureId.startsWith(prefix) || textureId.length === prefix.length) {
        throw new Error("The Woka service returned an invalid durable asset ID");
    }
    return textureId.slice(prefix.length);
}

function absoluteUrl(url: string, publicBaseUrl: string): string {
    return new URL(url, publicBaseUrl).href;
}

function assetName(targetAssetClass: string): string {
    const normalized = targetAssetClass.trim().replace(/\s+/g, " ");
    return (normalized.length === 0 ? "Generated asset" : normalized).slice(0, 80);
}

function wokaCategory(targetAssetClass: string): Exclude<TeapotWokaCategory, "woka"> {
    const normalized = targetAssetClass.trim().toLowerCase();
    if (normalized.includes("body")) return "body";
    if (normalized.includes("eye")) return "eyes";
    if (normalized.includes("hair")) return "hair";
    if (normalized.includes("clothes") || normalized.includes("clothing")) return "clothes";
    if (normalized.includes("hat")) return "hat";
    return "accessory";
}

export const teapotMcpAssetPersistence = new TeapotMcpAssetPersistence();
