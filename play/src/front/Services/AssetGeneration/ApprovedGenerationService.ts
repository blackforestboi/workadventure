import { AssetGenerationError, toRedactedGenerationError } from "./AssetGenerationError";
import { validateAssetGenerationGuidance } from "./GenerationGuidance";
import type {
    ApprovedAssetGenerationBatch,
    AssetGenerationLifecycleEvent,
    AssetGenerationResult,
    ImageGenerationProvider,
} from "./AssetGenerationTypes";

export type AssetGenerationLifecycleListener = (event: AssetGenerationLifecycleEvent) => void;

export class ApprovedGenerationService {
    private readonly consumedApprovals = new Set<string>();

    public constructor(
        private readonly provider: ImageGenerationProvider,
        private readonly onLifecycleEvent: AssetGenerationLifecycleListener = () => undefined,
    ) {}

    public async generate(
        batch: ApprovedAssetGenerationBatch,
        credential: string,
        signal: AbortSignal,
        onLifecycleEvent: AssetGenerationLifecycleListener = this.onLifecycleEvent,
    ): Promise<AssetGenerationResult> {
        this.validateBatch(batch);

        if (this.consumedApprovals.has(batch.approvalId)) {
            throw new AssetGenerationError(
                "approval_already_consumed",
                "This approval has already authorized a generation batch.",
                { providerId: this.provider.id },
            );
        }

        // Consume before dispatch so cancellation and provider failure cannot silently retry a paid call.
        this.consumedApprovals.add(batch.approvalId);
        onLifecycleEvent({ state: "generating", approvalId: batch.approvalId });

        try {
            const result = await this.provider.generate(batch.request, credential, signal);
            onLifecycleEvent({ state: "succeeded", approvalId: batch.approvalId, result });
            return result;
        } catch (error: unknown) {
            const redactedError = toRedactedGenerationError(error, this.provider.id);
            if (redactedError.code === "cancelled") {
                onLifecycleEvent({ state: "cancelled", approvalId: batch.approvalId });
            } else {
                onLifecycleEvent({
                    state: "failed",
                    approvalId: batch.approvalId,
                    error: redactedError.toPayload(),
                });
            }
            throw redactedError;
        }
    }

    private validateBatch(batch: ApprovedAssetGenerationBatch): void {
        const { metadata, request } = batch;
        validateAssetGenerationGuidance(request);
        if (batch.approvalId.trim() === "") {
            throw new AssetGenerationError("invalid_request", "A generation approval ID is required.");
        }
        if (metadata.providerId !== this.provider.id) {
            throw new AssetGenerationError("invalid_request", "The approval does not match the selected provider.");
        }
        if (
            metadata.modelId !== request.modelId ||
            metadata.target !== request.target ||
            metadata.outputCount !== request.outputCount
        ) {
            throw new AssetGenerationError("invalid_request", "The approved batch no longer matches the request.");
        }
        if (request.prompt.trim() === "") {
            throw new AssetGenerationError("invalid_request", "A generation prompt is required.");
        }
        if (
            !Number.isSafeInteger(request.outputCount) ||
            request.outputCount < 1 ||
            request.outputCount > this.provider.capabilities.maximumOutputCount
        ) {
            throw new AssetGenerationError("invalid_request", "The requested output count is not supported.");
        }
        if (request.references.length > 0 && !this.provider.capabilities.referenceImages) {
            throw new AssetGenerationError(
                "unsupported_capability",
                "The selected provider does not accept reference images.",
            );
        }
    }
}
