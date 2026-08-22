import { BRANDING } from "../../Branding";
import { AssetGenerationError, createProviderHttpError, toRedactedGenerationError } from "./AssetGenerationError";
import { copyToArrayBuffer, decodeBase64, encodeBase64 } from "./Base64";
import {
    buildGenerationGuidancePrompt,
    buildReferenceRoleInstruction,
    generationReferenceLabel,
    validateAssetGenerationGuidance,
} from "./GenerationGuidance";
import type {
    AssetGenerationCapabilities,
    AssetGenerationModel,
    AssetGenerationProviderId,
    AssetGenerationRequest,
    AssetGenerationResult,
    ImageGenerationProvider,
} from "./AssetGenerationTypes";

type HostedCliProvider = "codex" | "claude";

interface HostedCliImageProviderOptions {
    baseUrl?: string;
    fetcher?: typeof fetch;
}

/** Uses an owner-authenticated hosted CLI session without exposing provider OAuth tokens to the browser. */
export class HostedCliImageProvider implements ImageGenerationProvider {
    public readonly id: AssetGenerationProviderId;
    public readonly capabilities: AssetGenerationCapabilities = {
        imageOutput: true,
        referenceImages: true,
        cancellation: true,
        multipleOutputs: false,
        transparentBackground: true,
        deterministicSeed: false,
        maximumOutputCount: 1,
        acceptedReferenceMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    };
    private readonly baseUrl: string;
    private readonly fetcher: typeof fetch;

    public constructor(
        private readonly cliProvider: HostedCliProvider,
        options: HostedCliImageProviderOptions = {},
    ) {
        this.id = cliProvider === "codex" ? "codex-cli" : "claude-cli";
        this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
        this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    }

    public async listModels(credential: string, signal: AbortSignal): Promise<readonly AssetGenerationModel[]> {
        try {
            const response = await this.fetcher(`${this.providerUrl()}/models`, {
                headers: this.headers(credential, false),
                credentials: "same-origin",
                cache: "no-store",
                signal,
            });
            if (!response.ok) throw await createHostedProviderHttpError(this.id, response);
            const payload: unknown = await response.json();
            if (!isRecord(payload) || !Array.isArray(payload.models)) {
                throw new AssetGenerationError("malformed_response", "The hosted provider returned invalid models.", {
                    providerId: this.id,
                });
            }
            const models = payload.models.map(parseModel);
            if (models.length === 0) {
                throw new AssetGenerationError(
                    "unsupported_capability",
                    "This subscription has no compatible image-generation model.",
                    { providerId: this.id },
                );
            }
            return models;
        } catch (error: unknown) {
            throw toRedactedGenerationError(error, this.id);
        }
    }

    public async generate(
        request: AssetGenerationRequest,
        credential: string,
        signal: AbortSignal,
    ): Promise<AssetGenerationResult> {
        if (request.outputCount !== 1) {
            throw new AssetGenerationError("invalid_request", "Hosted subscription generation supports one output.", {
                providerId: this.id,
            });
        }
        validateAssetGenerationGuidance(request);
        try {
            const references = await Promise.all(
                request.references.map(async (reference, index) => ({
                    name: `${generationReferenceLabel(index)}.${extensionFor(reference.mimeType)}`,
                    mimeType: reference.mimeType,
                    role: reference.role,
                    instruction: buildReferenceRoleInstruction(reference, index),
                    base64: encodeBase64(new Uint8Array(await reference.blob.arrayBuffer())),
                })),
            );
            const response = await this.fetcher(`${this.providerUrl()}/generate`, {
                method: "POST",
                headers: this.headers(credential, true),
                credentials: "same-origin",
                cache: "no-store",
                signal,
                body: JSON.stringify({
                    model: request.modelId,
                    prompt: buildGenerationGuidancePrompt(request),
                    target: mapTarget(request.target),
                    references,
                }),
            });
            if (!response.ok) throw await createHostedProviderHttpError(this.id, response);
            const payload: unknown = await response.json();
            if (!isRecord(payload) || typeof payload.base64 !== "string" || !isRasterMimeType(payload.mimeType)) {
                throw new AssetGenerationError("malformed_response", "The hosted provider returned an invalid image.", {
                    providerId: this.id,
                });
            }
            const bytes = decodeBase64(payload.base64);
            return {
                assets: [
                    {
                        id: crypto.randomUUID(),
                        blob: new Blob([copyToArrayBuffer(bytes)], { type: payload.mimeType }),
                        mimeType: payload.mimeType,
                        animation: request.animation,
                    },
                ],
                provenance: {
                    providerId: this.id,
                    modelId: typeof payload.model === "string" ? payload.model : request.modelId,
                    ...(typeof payload.requestId === "string" ? { providerRequestId: payload.requestId } : {}),
                },
                usage: {},
            };
        } catch (error: unknown) {
            throw toRedactedGenerationError(error, this.id);
        }
    }

    private providerUrl(): string {
        return `${this.baseUrl}/teapot/ai/providers/${this.cliProvider}`;
    }

    private headers(credential: string, json: boolean): HeadersInit {
        if (credential.trim() === "") {
            throw new AssetGenerationError("missing_credential", `Log in to ${BRANDING.name} before connecting AI.`, {
                providerId: this.id,
            });
        }
        return { Authorization: credential, ...(json ? { "Content-Type": "application/json" } : {}) };
    }
}

async function createHostedProviderHttpError(
    providerId: AssetGenerationProviderId,
    response: Response,
): Promise<AssetGenerationError> {
    const generic = createProviderHttpError(providerId, response.status);
    try {
        const payload: unknown = await response.json();
        if (
            isRecord(payload) &&
            typeof payload.error === "string" &&
            payload.error.length > 0 &&
            payload.error.length <= 300
        ) {
            return new AssetGenerationError(generic.code, payload.error, {
                providerId,
                httpStatus: response.status,
                retryable: generic.retryable,
            });
        }
    } catch {
        // Preserve the standard bounded provider error for non-JSON responses.
    }
    return generic;
}

function parseModel(value: unknown): AssetGenerationModel {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
        throw new AssetGenerationError("malformed_response", "The hosted provider returned an invalid model.");
    }
    return {
        id: value.id,
        name: value.name,
        ...(typeof value.description === "string" ? { description: value.description } : {}),
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        supportedParameters: {},
        supportsStreaming: false,
    };
}

function mapTarget(target: AssetGenerationRequest["target"]): "woka-sheet" | "woka-layer" | "map-object" | "tileset" {
    if (target === "complete-woka") return "woka-sheet";
    if (target.startsWith("woka-")) return "woka-layer";
    if (target === "tileset") return "tileset";
    return "map-object";
}

function extensionFor(mimeType: string): string {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    return "png";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRasterMimeType(value: unknown): value is "image/png" | "image/jpeg" | "image/webp" {
    return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}
