import { AssetGenerationError, createProviderHttpError, toRedactedGenerationError } from "./AssetGenerationError";
import { copyToArrayBuffer, decodeBase64, encodeBase64 } from "./Base64";
import { removeEdgeConnectedBackground } from "./ChromaKeyBackgroundRemover";
import type {
    AssetGenerationCapabilities,
    AssetGenerationModel,
    AssetGenerationParameterDescriptor,
    AssetGenerationRequest,
    AssetGenerationResult,
    GeneratedAsset,
    ImageGenerationProvider,
} from "./AssetGenerationTypes";

const OPENROUTER_IMAGE_ENDPOINT = "https://openrouter.ai/api/v1/images";
const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY_ENDPOINT = "https://openrouter.ai/api/v1/key";
const MAX_GENERATED_IMAGE_BYTES = 25 * 1024 * 1024;
export const OPENROUTER_GENERATION_MODEL_ID = "google/gemini-3.1-flash-image";
export const OPENROUTER_GENERATION_MODEL_NAME = "Nano Banana 2";
/**
 * Use the established Image API in production. The Chat Completions route is
 * retained as an opt-in experiment for models that expose image reasoning.
 */
export const OPENROUTER_GENERATION_TRANSPORT = "dedicated-image" as const;
export type OpenRouterGenerationTransport = "chat-with-reasoning" | "dedicated-image";

export type AssetGenerationFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface OpenRouterImageProviderOptions {
    fetcher?: AssetGenerationFetch;
    imageEndpoint?: string;
    chatCompletionsEndpoint?: string;
    keyEndpoint?: string;
    transport?: OpenRouterGenerationTransport;
}

export class OpenRouterImageProvider implements ImageGenerationProvider {
    public readonly id = "openrouter" as const;
    public readonly capabilities: AssetGenerationCapabilities = {
        imageOutput: true,
        referenceImages: true,
        cancellation: true,
        multipleOutputs: true,
        transparentBackground: true,
        deterministicSeed: true,
        maximumOutputCount: 10,
        acceptedReferenceMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    };

    private readonly fetcher: AssetGenerationFetch;
    private readonly imageEndpoint: string;
    private readonly chatCompletionsEndpoint: string;
    private readonly keyEndpoint: string;
    private readonly transport: OpenRouterGenerationTransport;

    public constructor(options: OpenRouterImageProviderOptions = {}) {
        this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
        this.imageEndpoint = options.imageEndpoint ?? OPENROUTER_IMAGE_ENDPOINT;
        this.chatCompletionsEndpoint = options.chatCompletionsEndpoint ?? OPENROUTER_CHAT_COMPLETIONS_ENDPOINT;
        this.keyEndpoint = options.keyEndpoint ?? OPENROUTER_KEY_ENDPOINT;
        this.transport = options.transport ?? OPENROUTER_GENERATION_TRANSPORT;
    }

    public async listModels(credential: string, signal: AbortSignal): Promise<readonly AssetGenerationModel[]> {
        const response = await this.performFetch(
            this.keyEndpoint,
            {
                method: "GET",
                headers: this.createHeaders(credential),
                signal,
            },
            signal,
        );

        if (!response.ok) {
            const payload = await this.readErrorPayload(response);
            throw createProviderHttpError(this.id, response.status, openRouterErrorReason(payload));
        }

        const payload = await this.readJson(response);
        // `/images/models` is public and therefore cannot prove that the
        // supplied credential works. `/key` is authenticated and avoids a UI
        // that says “connected” until the first paid generation fails.
        if (!isRecord(payload) || !isRecord(payload.data)) {
            throw this.malformedResponse();
        }

        return [
            {
                id: OPENROUTER_GENERATION_MODEL_ID,
                name: OPENROUTER_GENERATION_MODEL_NAME,
                description: "Fast OpenRouter image generation.",
                inputModalities: ["text", "image"],
                outputModalities: ["image", "text"],
                supportedParameters: {},
                supportsStreaming: false,
            },
        ];
    }

    public async generate(
        request: AssetGenerationRequest,
        credential: string,
        signal: AbortSignal,
    ): Promise<AssetGenerationResult> {
        if (signal.aborted) {
            throw toRedactedGenerationError(new DOMException("Aborted", "AbortError"), this.id);
        }

        const inputReferences = await Promise.all(
            request.references.map(async (reference) => ({
                type: "image_url",
                image_url: {
                    url: `data:${reference.mimeType};base64,${encodeBase64(
                        new Uint8Array(await reference.blob.arrayBuffer()),
                    )}`,
                },
            })),
        );

        const generated = await Promise.all(
            Array.from({ length: request.outputCount }, async (_, index) => {
                return this.generateSingleAsset(request, credential, inputReferences, index, signal);
            }),
        );

        const first = generated[0];
        if (first === undefined) throw this.malformedResponse();
        const assets = generated.map(({ asset }) => ({ ...asset, animation: request.animation }));

        return {
            assets,
            provenance: {
                providerId: this.id,
                modelId: OPENROUTER_GENERATION_MODEL_ID,
                providerRequestId: first.providerRequestId,
                providerCreatedAt: parseProviderCreatedAt(recordValue(first.payload, "created")),
            },
            usage: mergeUsage(generated.map(({ payload }) => parseUsage(recordValue(payload, "usage")))),
        };
    }

    private async generateSingleAsset(
        request: AssetGenerationRequest,
        credential: string,
        inputReferences: readonly { type: string; image_url: { url: string } }[],
        index: number,
        signal: AbortSignal,
    ): Promise<{ asset: GeneratedAsset; payload: unknown; providerRequestId: string | undefined }> {
        return this.transport === "chat-with-reasoning"
            ? this.generateSingleChatAsset(request, credential, inputReferences, index, signal)
            : this.generateSingleImageApiAsset(request, credential, inputReferences, index, signal);
    }

    private async generateSingleChatAsset(
        request: AssetGenerationRequest,
        credential: string,
        inputReferences: readonly { type: string; image_url: { url: string } }[],
        index: number,
        signal: AbortSignal,
    ): Promise<{ asset: GeneratedAsset; payload: unknown; providerRequestId: string | undefined }> {
        const response = await this.performFetch(
            this.chatCompletionsEndpoint,
            {
                method: "POST",
                headers: this.createHeaders(credential),
                body: JSON.stringify({
                    model: OPENROUTER_GENERATION_MODEL_ID,
                    modalities: ["text", "image"],
                    // Keep the reasoning internal: it is useful for applying the
                    // pose contract but is neither persisted nor shown in the UI.
                    reasoning: { effort: "low", exclude: true },
                    image_config: { aspect_ratio: "1:1" },
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are an exact sprite-animation renderer. Privately inspect every supplied image reference before rendering. When asked for Step B from Step A, compare the Step A source with the target pose guide and make the opposite foot and arm contact visibly different. Never satisfy a requested animation frame by reusing or minimally varying a reference image. Return only the requested image.",
                        },
                        {
                            role: "user",
                            content: [
                                { type: "text", text: this.createImagePrompt(request) },
                                ...inputReferences.slice(0, 14),
                            ],
                        },
                    ],
                }),
                signal,
            },
            signal,
        );
        if (!response.ok) {
            const payload = await this.readErrorPayload(response);
            throw createProviderHttpError(this.id, response.status, openRouterErrorReason(payload));
        }
        const payload = await this.readJson(response);
        const providerRequestId = response.headers.get("x-request-id") ?? stringValue(payload, "id");
        const asset = await this.decodeChatGeneratedAsset(
            payload,
            `${providerRequestId ?? "openrouter-result"}-${index}`,
        );
        return { asset, payload, providerRequestId };
    }

    private async generateSingleImageApiAsset(
        request: AssetGenerationRequest,
        credential: string,
        inputReferences: readonly { type: string; image_url: { url: string } }[],
        index: number,
        signal: AbortSignal,
    ): Promise<{ asset: GeneratedAsset; payload: unknown; providerRequestId: string | undefined }> {
        const response = await this.performFetch(
            this.imageEndpoint,
            {
                method: "POST",
                headers: this.createHeaders(credential),
                body: JSON.stringify({
                    model: OPENROUTER_GENERATION_MODEL_ID,
                    prompt: this.createImagePrompt(request),
                    resolution: "512",
                    aspect_ratio: "1:1",
                    // Nano Banana 2 accepts up to fourteen references. Omit the
                    // field entirely when none are supplied.
                    ...(inputReferences.length === 0 ? {} : { input_references: inputReferences.slice(0, 14) }),
                    n: 1,
                }),
                signal,
            },
            signal,
        );
        if (!response.ok) {
            const payload = await this.readErrorPayload(response);
            throw createProviderHttpError(this.id, response.status, openRouterErrorReason(payload));
        }
        const payload = await this.readJson(response);
        const providerRequestId = response.headers.get("x-request-id") ?? stringValue(payload, "id");
        const asset = await this.decodeGeneratedAsset(payload, `${providerRequestId ?? "openrouter-result"}-${index}`);
        return { asset, payload, providerRequestId };
    }

    private createImagePrompt(request: AssetGenerationRequest): string {
        const avatarIsolationRule =
            request.target === "complete-woka" || request.target.startsWith("woka-")
                ? "Avatar composition rule: show only one free-standing character. Never add a floor, ground plane, terrain, grass, path, pedestal, platform, horizon, baseline, contact line, contact shadow, scene, or frame around the character. There must be no visible mark beneath its feet."
                : "";
        return `${request.prompt}\n\n${avatarIsolationRule}\n\nUse a uniform chroma background for easy removal. Generate exactly one isolated subject against one flat, solid, untextured background colour with clear padding between the subject and every canvas edge. The background is a machine-readable matte that will be removed after generation. Never draw a checkerboard, transparency raster, grid, tiles, UI frame, border, rounded rectangle, gradient, texture, shadow, reflection, scenery, props, or a second background colour.`;
    }

    private async decodeGeneratedAsset(payload: unknown, id: string): Promise<GeneratedAsset> {
        return this.decodeImageAsset(parseGeneratedImageBase64(payload), parseGeneratedImageMimeType(payload), id);
    }

    private async decodeChatGeneratedAsset(payload: unknown, id: string): Promise<GeneratedAsset> {
        const image = parseChatGeneratedImage(payload);
        return this.decodeImageAsset(image.encoded, image.mimeType, id);
    }

    private async decodeImageAsset(
        encoded: string,
        declaredMimeType: "image/png" | "image/jpeg" | "image/webp" | undefined,
        id: string,
    ): Promise<GeneratedAsset> {
        let bytes: Uint8Array;
        try {
            bytes = decodeBase64(encoded);
        } catch (error: unknown) {
            throw this.malformedResponse(error);
        }
        const mimeType = declaredMimeType ?? sniffRasterMimeType(bytes);
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_GENERATED_IMAGE_BYTES || mimeType === undefined) {
            throw this.malformedResponse();
        }
        const normalized = await normalizeOpenRouterImage(new Blob([copyToArrayBuffer(bytes)], { type: mimeType }));
        return { id, blob: normalized, mimeType: "image/webp" };
    }

    private async performFetch(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
        if (signal.aborted) {
            throw toRedactedGenerationError(new DOMException("Aborted", "AbortError"), this.id);
        }
        try {
            return await this.fetcher(url, init);
        } catch (error: unknown) {
            if (signal.aborted) {
                throw toRedactedGenerationError(new DOMException("Aborted", "AbortError"), this.id);
            }
            throw toRedactedGenerationError(error, this.id);
        }
    }

    private async readJson(response: Response): Promise<unknown> {
        try {
            const payload: unknown = await response.json();
            return payload;
        } catch (error: unknown) {
            throw this.malformedResponse(error);
        }
    }

    private async readErrorPayload(response: Response): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            return undefined;
        }
    }

    private createHeaders(credential: string): HeadersInit {
        return {
            Authorization: `Bearer ${credential}`,
            "Content-Type": "application/json",
        };
    }

    private parseModel(value: unknown): AssetGenerationModel {
        if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
            throw this.malformedResponse();
        }

        const architecture: Record<string, unknown> = isRecord(value.architecture) ? value.architecture : {};
        return {
            id: value.id,
            name: value.name,
            description: typeof value.description === "string" ? value.description : undefined,
            inputModalities: stringArray(architecture.input_modalities),
            outputModalities: stringArray(architecture.output_modalities),
            supportedParameters: parseSupportedParameters(value.supported_parameters),
            supportsStreaming: value.supports_streaming === true,
        };
    }

    private malformedResponse(cause?: unknown): AssetGenerationError {
        return new AssetGenerationError("malformed_response", "The provider returned an invalid image response.", {
            providerId: this.id,
            cause,
        });
    }
}

function openRouterErrorReason(payload: unknown): string | undefined {
    if (!isRecord(payload)) return undefined;
    const error = payload.error;
    if (typeof error === "string") return error;
    if (!isRecord(error)) return undefined;
    return typeof error.message === "string" ? error.message : undefined;
}

function parseGeneratedImageBase64(payload: unknown): string {
    if (!isRecord(payload) || !Array.isArray(payload.data)) throw malformedOpenRouterResponse();
    const image = payload.data[0];
    if (!isRecord(image) || typeof image.b64_json !== "string" || image.b64_json.length === 0) {
        throw malformedOpenRouterResponse();
    }
    return image.b64_json;
}

function parseGeneratedImageMimeType(payload: unknown): "image/png" | "image/jpeg" | "image/webp" | undefined {
    if (!isRecord(payload) || !Array.isArray(payload.data)) return undefined;
    const mediaType = recordValue(payload.data[0], "media_type");
    return mediaType === "image/png" || mediaType === "image/jpeg" || mediaType === "image/webp"
        ? mediaType
        : undefined;
}

function parseChatGeneratedImage(payload: unknown): {
    encoded: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp" | undefined;
} {
    const message = firstChatMessage(payload);
    const candidates = [
        recordValue(message, "images"),
        recordValue(message, "content"),
        recordValue(message, "image_url"),
        recordValue(message, "imageUrl"),
    ];
    for (const candidate of candidates) {
        const dataUrl = findImageDataUrl(candidate);
        if (dataUrl !== undefined) return parseImageDataUrl(dataUrl);
    }
    throw malformedOpenRouterResponse();
}

function firstChatMessage(payload: unknown): Record<string, unknown> {
    if (!isRecord(payload) || !Array.isArray(payload.choices)) throw malformedOpenRouterResponse();
    const choice = payload.choices[0];
    const message = recordValue(choice, "message");
    if (!isRecord(message)) throw malformedOpenRouterResponse();
    return message;
}

function findImageDataUrl(value: unknown): string | undefined {
    if (typeof value === "string") {
        const match = value.match(/data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+/);
        return match?.[0];
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findImageDataUrl(item);
            if (found !== undefined) return found;
        }
        return undefined;
    }
    if (!isRecord(value)) return undefined;
    return findImageDataUrl(recordValue(value, "url")) ?? findImageDataUrl(recordValue(value, "image_url"));
}

function parseImageDataUrl(dataUrl: string): {
    encoded: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
} {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (match === null) throw malformedOpenRouterResponse();
    const mimeType = match[1];
    const encoded = match[2];
    if (encoded === undefined || (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp")) {
        throw malformedOpenRouterResponse();
    }
    return { encoded, mimeType };
}

function malformedOpenRouterResponse(cause?: unknown): AssetGenerationError {
    return new AssetGenerationError("malformed_response", "The provider returned an invalid image response.", {
        providerId: "openrouter",
        cause,
    });
}

async function normalizeOpenRouterImage(blob: Blob): Promise<Blob> {
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
        if (blob.type === "image/webp") return blob;
        throw malformedOpenRouterResponse();
    }
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (context === null) throw malformedOpenRouterResponse();
        context.drawImage(bitmap, 0, 0);
        const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
        if (removeEdgeConnectedBackground(image)) context.putImageData(image, 0, 0);
        return canvas.convertToBlob({ type: "image/webp", quality: 0.92 });
    } finally {
        bitmap.close();
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): readonly string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseSupportedParameters(value: unknown): Readonly<Record<string, AssetGenerationParameterDescriptor>> {
    if (!isRecord(value)) {
        return {};
    }

    const descriptors: Record<string, AssetGenerationParameterDescriptor> = {};
    for (const [name, descriptor] of Object.entries(value)) {
        if (!isRecord(descriptor) || typeof descriptor.type !== "string") continue;

        if (descriptor.type === "boolean") {
            descriptors[name] = { type: "boolean" };
        } else if (descriptor.type === "enum") {
            descriptors[name] = { type: "enum", values: stringArray(descriptor.values) };
        } else if (
            descriptor.type === "range" &&
            typeof descriptor.min === "number" &&
            typeof descriptor.max === "number"
        ) {
            descriptors[name] = { type: "range", minimum: descriptor.min, maximum: descriptor.max };
        }
    }
    return descriptors;
}

function parseProviderCreatedAt(value: unknown): string | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const date = new Date(value * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function parseUsage(value: unknown): AssetGenerationResult["usage"] {
    if (!isRecord(value)) return {};

    return {
        promptTokens: finiteNumber(value.prompt_tokens),
        completionTokens: finiteNumber(value.completion_tokens),
        totalTokens: finiteNumber(value.total_tokens),
        actualCost:
            typeof value.cost === "number" && Number.isFinite(value.cost) && value.cost >= 0
                ? { currency: "USD", amount: value.cost }
                : undefined,
    };
}

function mergeUsage(usages: readonly AssetGenerationResult["usage"][]): AssetGenerationResult["usage"] {
    const promptTokens = sumNumbers(usages.map((usage) => usage.promptTokens));
    const completionTokens = sumNumbers(usages.map((usage) => usage.completionTokens));
    const totalTokens = sumNumbers(usages.map((usage) => usage.totalTokens));
    const costs = usages.map((usage) => usage.actualCost?.amount).filter((cost): cost is number => cost !== undefined);
    return {
        promptTokens,
        completionTokens,
        totalTokens,
        actualCost:
            costs.length === usages.length
                ? { currency: "USD", amount: costs.reduce((total, cost) => total + cost, 0) }
                : undefined,
    };
}

function sumNumbers(values: readonly (number | undefined)[]): number | undefined {
    const numbers = values.filter((value): value is number => value !== undefined);
    return numbers.length === values.length ? numbers.reduce((total, value) => total + value, 0) : undefined;
}

function stringValue(value: unknown, key: string): string | undefined {
    return isRecord(value) && typeof value[key] === "string" ? value[key] : undefined;
}

function recordValue(value: unknown, key: string): unknown {
    return isRecord(value) ? value[key] : undefined;
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sniffRasterMimeType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | undefined {
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return "image/png";
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }

    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return "image/webp";
    }

    return undefined;
}
