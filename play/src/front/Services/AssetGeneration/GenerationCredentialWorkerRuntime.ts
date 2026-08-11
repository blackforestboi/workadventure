import { ApprovedGenerationService } from "./ApprovedGenerationService";
import { AssetGenerationError, toRedactedGenerationError } from "./AssetGenerationError";
import type { AssetGenerationProviderId, ImageGenerationProvider } from "./AssetGenerationTypes";
import type { GenerationWorkerRequest, GenerationWorkerResponse } from "./GenerationWorkerProtocol";

type PostWorkerResponse = (response: GenerationWorkerResponse) => void;

interface ActiveGeneration {
    providerId: AssetGenerationProviderId;
    controller: AbortController;
    requestId: string;
    approvalId: string;
}

export class GenerationCredentialWorkerRuntime {
    private readonly providers = new Map<AssetGenerationProviderId, ImageGenerationProvider>();
    private readonly services = new Map<AssetGenerationProviderId, ApprovedGenerationService>();
    private readonly credentials = new Map<AssetGenerationProviderId, string>();
    private readonly activeGenerations = new Map<string, ActiveGeneration>();
    private disposed = false;

    public constructor(providers: readonly ImageGenerationProvider[]) {
        for (const provider of providers) {
            this.providers.set(provider.id, provider);
            this.services.set(provider.id, new ApprovedGenerationService(provider));
        }
    }

    public async handleMessage(message: GenerationWorkerRequest, postResponse: PostWorkerResponse): Promise<void> {
        try {
            if (this.disposed && message.type !== "runtime.dispose") {
                throw new AssetGenerationError("invalid_request", "The generation worker is closed.");
            }

            switch (message.type) {
                case "credential.configure":
                    this.configureCredential(message.providerId, message.credential);
                    postResponse({ type: "operation.complete", requestId: message.requestId });
                    return;
                case "credential.clear":
                    this.clearCredential(message.providerId);
                    postResponse({ type: "operation.complete", requestId: message.requestId });
                    return;
                case "models.list":
                    await this.listModels(message, postResponse);
                    return;
                case "generation.execute":
                    await this.executeGeneration(message, postResponse);
                    return;
                case "generation.cancel":
                    this.cancelGeneration(message.jobId, message.requestId, postResponse);
                    return;
                case "runtime.dispose":
                    this.dispose();
                    postResponse({ type: "operation.complete", requestId: message.requestId });
                    return;
                default: {
                    const exhaustiveCheck: never = message;
                    throw new AssetGenerationError(
                        "invalid_request",
                        `Unsupported generation worker operation: ${String(exhaustiveCheck)}`,
                    );
                }
            }
        } catch (error: unknown) {
            postResponse({
                type: "operation.error",
                requestId: message.requestId,
                error: toRedactedGenerationError(error).toPayload(),
            });
        }
    }

    private configureCredential(providerId: AssetGenerationProviderId, credential: string): void {
        this.getProvider(providerId);
        if (credential.trim() === "") {
            throw new AssetGenerationError("missing_credential", "A provider credential is required.", { providerId });
        }
        this.credentials.set(providerId, credential);
    }

    private clearCredential(providerId?: AssetGenerationProviderId): void {
        if (providerId === undefined) {
            for (const generation of this.activeGenerations.values()) generation.controller.abort();
            this.credentials.clear();
            return;
        }

        this.credentials.delete(providerId);
        for (const generation of this.activeGenerations.values()) {
            if (generation.providerId === providerId) generation.controller.abort();
        }
    }

    private async listModels(
        message: Extract<GenerationWorkerRequest, { type: "models.list" }>,
        postResponse: PostWorkerResponse,
    ): Promise<void> {
        const provider = this.getProvider(message.providerId);
        const credential = this.getCredential(message.providerId);
        const models = await provider.listModels(credential, new AbortController().signal);
        postResponse({ type: "models.result", requestId: message.requestId, models });
    }

    private async executeGeneration(
        message: Extract<GenerationWorkerRequest, { type: "generation.execute" }>,
        postResponse: PostWorkerResponse,
    ): Promise<void> {
        const providerId = message.batch.metadata.providerId;
        const service = this.services.get(providerId);
        if (service === undefined) this.getProvider(providerId);
        const generationService = service ?? this.services.get(providerId);
        if (generationService === undefined) {
            throw new AssetGenerationError("unsupported_capability", "The selected image provider is unavailable.", {
                providerId,
            });
        }
        if (this.activeGenerations.has(message.jobId)) {
            throw new AssetGenerationError("invalid_request", "A generation job with this ID is already active.");
        }

        const credential = this.getCredential(providerId);
        const controller = new AbortController();
        this.activeGenerations.set(message.jobId, {
            providerId,
            controller,
            requestId: message.requestId,
            approvalId: message.batch.approvalId,
        });
        try {
            const result = await generationService.generate(message.batch, credential, controller.signal, (event) =>
                postResponse({
                    type: "generation.lifecycle",
                    requestId: message.requestId,
                    jobId: message.jobId,
                    event,
                }),
            );
            postResponse({
                type: "generation.result",
                requestId: message.requestId,
                jobId: message.jobId,
                result,
            });
        } catch (error: unknown) {
            postResponse({
                type: "operation.error",
                requestId: message.requestId,
                jobId: message.jobId,
                error: toRedactedGenerationError(error, providerId).toPayload(),
            });
        } finally {
            this.activeGenerations.delete(message.jobId);
        }
    }

    private cancelGeneration(jobId: string, requestId: string, postResponse: PostWorkerResponse): void {
        const generation = this.activeGenerations.get(jobId);
        if (generation !== undefined) {
            postResponse({
                type: "generation.lifecycle",
                requestId: generation.requestId,
                jobId,
                event: { state: "cancelling", approvalId: generation.approvalId },
            });
            generation.controller.abort();
        }
        postResponse({ type: "operation.complete", requestId });
    }

    private getProvider(providerId: AssetGenerationProviderId): ImageGenerationProvider {
        const provider = this.providers.get(providerId);
        if (provider === undefined) {
            throw new AssetGenerationError("unsupported_capability", "The selected image provider is unavailable.", {
                providerId,
            });
        }
        return provider;
    }

    private getCredential(providerId: AssetGenerationProviderId): string {
        const credential = this.credentials.get(providerId);
        if (credential === undefined) {
            throw new AssetGenerationError("missing_credential", "Connect this provider before generating.", {
                providerId,
            });
        }
        return credential;
    }

    private dispose(): void {
        for (const generation of this.activeGenerations.values()) generation.controller.abort();
        this.activeGenerations.clear();
        this.credentials.clear();
        this.disposed = true;
    }
}
