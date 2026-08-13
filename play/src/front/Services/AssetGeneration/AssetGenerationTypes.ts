import type { VisualAssetAnimation } from "@workadventure/map-editor";

export type AssetGenerationProviderId = "openrouter" | "codex-cli" | "claude-cli" | "fake";

export type AssetGenerationTarget =
    | "complete-woka"
    | "woka-body"
    | "woka-eyes"
    | "woka-hair"
    | "woka-clothes"
    | "woka-hat"
    | "woka-accessory"
    | "environment-object"
    | "vegetation"
    | "terrain-surface"
    | "tileset";

export type AssetGenerationLifecycleState =
    | "idle"
    | "connecting"
    | "ready"
    | "generating"
    | "cancelling"
    | "cancelled"
    | "succeeded"
    | "failed";

export type AssetGenerationErrorCode =
    | "missing_credential"
    | "authentication_failed"
    | "rate_limited"
    | "cancelled"
    | "network_error"
    | "provider_error"
    | "malformed_response"
    | "unsupported_capability"
    | "invalid_request"
    | "approval_already_consumed";

export interface AssetGenerationCapabilities {
    imageOutput: boolean;
    referenceImages: boolean;
    cancellation: boolean;
    multipleOutputs: boolean;
    transparentBackground: boolean;
    deterministicSeed: boolean;
    maximumOutputCount: number;
    acceptedReferenceMimeTypes: readonly string[];
}

export type AssetGenerationParameterDescriptor =
    | { type: "boolean" }
    | { type: "enum"; values: readonly string[] }
    | { type: "range"; minimum: number; maximum: number };

export interface AssetGenerationModel {
    id: string;
    name: string;
    description?: string;
    inputModalities: readonly string[];
    outputModalities: readonly string[];
    supportedParameters: Readonly<Record<string, AssetGenerationParameterDescriptor>>;
    supportsStreaming: boolean;
}

export interface AssetGenerationReference {
    id: string;
    blob: Blob;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface AssetGenerationRequest {
    modelId: string;
    target: AssetGenerationTarget;
    prompt: string;
    outputCount: number;
    references: readonly AssetGenerationReference[];
    outputFormat?: "png" | "jpeg" | "webp";
    background?: "auto" | "transparent" | "opaque";
    size?: string;
    aspectRatio?: string;
    quality?: "auto" | "low" | "medium" | "high";
    seed?: number;
    animation?: VisualAssetAnimation;
}

export type AssetGenerationCost =
    | {
          kind: "known";
          currency: "USD";
          maximumAmount: number;
      }
    | {
          kind: "unknown";
          reason: string;
      };

export interface AssetGenerationApprovalMetadata {
    providerId: AssetGenerationProviderId;
    modelId: string;
    target: AssetGenerationTarget;
    outputCount: number;
    maximumCost: AssetGenerationCost;
}

export interface ApprovedAssetGenerationBatch {
    approvalId: string;
    approvedAt: string;
    metadata: AssetGenerationApprovalMetadata;
    request: AssetGenerationRequest;
    titlePrompt?: string;
}

export interface AssetGenerationUsage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    actualCost?: {
        currency: "USD";
        amount: number;
    };
}

export interface AssetGenerationProvenance {
    providerId: AssetGenerationProviderId;
    modelId: string;
    providerRequestId?: string;
    providerCreatedAt?: string;
}

export interface GeneratedAsset {
    id: string;
    blob: Blob;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    revisedPrompt?: string;
    animation?: VisualAssetAnimation;
}

export interface AssetGenerationResult {
    assets: readonly GeneratedAsset[];
    provenance: AssetGenerationProvenance;
    usage: AssetGenerationUsage;
    title?: string;
}

export type AssetGenerationLifecycleEvent =
    | { state: "generating"; approvalId: string }
    | { state: "cancelling"; approvalId: string }
    | { state: "cancelled"; approvalId: string }
    | { state: "succeeded"; approvalId: string; result: AssetGenerationResult }
    | { state: "failed"; approvalId: string; error: AssetGenerationErrorPayload };

export interface AssetGenerationErrorPayload {
    code: AssetGenerationErrorCode;
    message: string;
    providerId?: AssetGenerationProviderId;
    httpStatus?: number;
    retryable: boolean;
}

export interface ImageGenerationProvider {
    readonly id: AssetGenerationProviderId;
    readonly capabilities: AssetGenerationCapabilities;
    listModels(credential: string, signal: AbortSignal): Promise<readonly AssetGenerationModel[]>;
    generate(request: AssetGenerationRequest, credential: string, signal: AbortSignal): Promise<AssetGenerationResult>;
    generateTitle?(prompt: string, credential: string, signal: AbortSignal): Promise<string | undefined>;
}
