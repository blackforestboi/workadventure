import { createCancelledGenerationError } from "./AssetGenerationError";
import { copyToArrayBuffer, decodeBase64 } from "./Base64";
import type {
    AssetGenerationCapabilities,
    AssetGenerationModel,
    AssetGenerationRequest,
    AssetGenerationResult,
    ImageGenerationProvider,
} from "./AssetGenerationTypes";

const TRANSPARENT_PIXEL_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XHLKAAAAAElFTkSuQmCC";

export class DeterministicFakeImageProvider implements ImageGenerationProvider {
    public readonly id = "fake" as const;
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

    public listModels(_credential: string, signal: AbortSignal): Promise<readonly AssetGenerationModel[]> {
        this.throwIfAborted(signal);
        return Promise.resolve([
            {
                id: "fake/deterministic-image",
                name: "Deterministic image fixture",
                description: "A local provider used for predictable development and tests.",
                inputModalities: ["text", "image"],
                outputModalities: ["image"],
                supportedParameters: {
                    background: { type: "enum", values: ["auto", "transparent", "opaque"] },
                    seed: { type: "boolean" },
                },
                supportsStreaming: false,
            },
        ]);
    }

    public generate(
        request: AssetGenerationRequest,
        _credential: string,
        signal: AbortSignal,
    ): Promise<AssetGenerationResult> {
        this.throwIfAborted(signal);
        const bytes = decodeBase64(TRANSPARENT_PIXEL_PNG);
        const assets = Array.from({ length: request.outputCount }, (_, index) => ({
            id: `fake-${request.seed ?? 0}-${index}`,
            blob: new Blob([copyToArrayBuffer(bytes)], { type: "image/png" }),
            mimeType: "image/png" as const,
        }));

        return Promise.resolve({
            assets,
            provenance: {
                providerId: this.id,
                modelId: request.modelId,
                providerRequestId: `fake-${request.seed ?? 0}`,
            },
            usage: {
                actualCost: { currency: "USD", amount: 0 },
            },
        });
    }

    private throwIfAborted(signal: AbortSignal): void {
        if (signal.aborted) {
            throw createCancelledGenerationError(this.id);
        }
    }
}
