import { AssetGenerationError } from "./AssetGenerationError";
import type {
    ApprovedAssetGenerationBatch,
    AssetGenerationLifecycleEvent,
    AssetGenerationModel,
    AssetGenerationProviderId,
    AssetGenerationResult,
} from "./AssetGenerationTypes";
import type { GenerationWorkerRequest, GenerationWorkerResponse } from "./GenerationWorkerProtocol";

export interface GenerationWorkerTransport {
    postMessage(message: GenerationWorkerRequest): void;
    terminate(): void;
    addEventListener(type: "message", listener: (event: MessageEvent<GenerationWorkerResponse>) => void): void;
    removeEventListener(type: "message", listener: (event: MessageEvent<GenerationWorkerResponse>) => void): void;
}

type VoidPendingOperation = { resolve: () => void; reject: (error: Error) => void };
type ModelsPendingOperation = {
    resolve: (models: readonly AssetGenerationModel[]) => void;
    reject: (error: Error) => void;
};
type GenerationPendingOperation = {
    resolve: (result: AssetGenerationResult) => void;
    reject: (error: Error) => void;
    onLifecycleEvent: (event: AssetGenerationLifecycleEvent) => void;
    signal?: AbortSignal;
    abortListener?: () => void;
};

export class GenerationWorkerClient {
    private readonly voidOperations = new Map<string, VoidPendingOperation>();
    private readonly modelOperations = new Map<string, ModelsPendingOperation>();
    private readonly generations = new Map<string, GenerationPendingOperation>();
    private requestCounter = 0;
    private disposed = false;

    public constructor(private readonly worker: GenerationWorkerTransport) {
        this.worker.addEventListener("message", this.handleMessage);
    }

    public configureCredential(providerId: AssetGenerationProviderId, credential: string): Promise<void> {
        const requestId = this.nextRequestId();
        return this.waitForVoid(requestId, { type: "credential.configure", requestId, providerId, credential });
    }

    public clearCredential(providerId?: AssetGenerationProviderId): Promise<void> {
        const requestId = this.nextRequestId();
        return this.waitForVoid(requestId, { type: "credential.clear", requestId, providerId });
    }

    public listModels(providerId: AssetGenerationProviderId): Promise<readonly AssetGenerationModel[]> {
        this.assertActive();
        const requestId = this.nextRequestId();
        return new Promise((resolve, reject) => {
            this.modelOperations.set(requestId, { resolve, reject });
            this.worker.postMessage({ type: "models.list", requestId, providerId });
        });
    }

    public generate(
        batch: ApprovedAssetGenerationBatch,
        options: {
            signal?: AbortSignal;
            onLifecycleEvent?: (event: AssetGenerationLifecycleEvent) => void;
        } = {},
    ): Promise<AssetGenerationResult> {
        this.assertActive();
        if (options.signal?.aborted === true) {
            return Promise.reject(new AssetGenerationError("cancelled", "Generation was cancelled."));
        }
        const requestId = this.nextRequestId();
        const jobId = `generation-${requestId}`;

        return new Promise((resolve, reject) => {
            const abortListener = () => {
                const cancelRequestId = this.nextRequestId();
                this.waitForVoid(cancelRequestId, {
                    type: "generation.cancel",
                    requestId: cancelRequestId,
                    jobId,
                }).catch(() => undefined);
            };
            this.generations.set(requestId, {
                resolve,
                reject,
                onLifecycleEvent: options.onLifecycleEvent ?? (() => undefined),
                signal: options.signal,
                abortListener,
            });
            options.signal?.addEventListener("abort", abortListener, { once: true });
            this.worker.postMessage({ type: "generation.execute", requestId, jobId, batch });
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.worker.removeEventListener("message", this.handleMessage);
        // Termination is the strongest browser guarantee that worker-held credential strings and jobs are released.
        this.worker.terminate();
        const error = new AssetGenerationError("cancelled", "The generation worker was closed.");
        for (const pending of this.voidOperations.values()) pending.reject(error);
        for (const pending of this.modelOperations.values()) pending.reject(error);
        for (const pending of this.generations.values()) {
            this.removeAbortListener(pending);
            pending.reject(error);
        }
        this.voidOperations.clear();
        this.modelOperations.clear();
        this.generations.clear();
    }

    private readonly handleMessage = (event: MessageEvent<GenerationWorkerResponse>): void => {
        const response = event.data;
        if (response.type === "operation.complete") {
            this.voidOperations.get(response.requestId)?.resolve();
            this.voidOperations.delete(response.requestId);
            return;
        }
        if (response.type === "models.result") {
            this.modelOperations.get(response.requestId)?.resolve(response.models);
            this.modelOperations.delete(response.requestId);
            return;
        }
        if (response.type === "generation.lifecycle") {
            this.generations.get(response.requestId)?.onLifecycleEvent(response.event);
            return;
        }
        if (response.type === "generation.result") {
            const pending = this.generations.get(response.requestId);
            if (pending !== undefined) {
                this.removeAbortListener(pending);
                pending.resolve(response.result);
                this.generations.delete(response.requestId);
            }
            return;
        }

        const error = new AssetGenerationError(response.error.code, response.error.message, {
            providerId: response.error.providerId,
            httpStatus: response.error.httpStatus,
            retryable: response.error.retryable,
        });
        const generation = this.generations.get(response.requestId);
        if (generation !== undefined) {
            this.removeAbortListener(generation);
            generation.reject(error);
            this.generations.delete(response.requestId);
            return;
        }
        this.modelOperations.get(response.requestId)?.reject(error);
        this.modelOperations.delete(response.requestId);
        this.voidOperations.get(response.requestId)?.reject(error);
        this.voidOperations.delete(response.requestId);
    };

    private waitForVoid(requestId: string, request: GenerationWorkerRequest): Promise<void> {
        this.assertActive();
        return new Promise((resolve, reject) => {
            this.voidOperations.set(requestId, { resolve, reject });
            this.worker.postMessage(request);
        });
    }

    private removeAbortListener(pending: GenerationPendingOperation): void {
        if (pending.signal !== undefined && pending.abortListener !== undefined) {
            pending.signal.removeEventListener("abort", pending.abortListener);
        }
    }

    private nextRequestId(): string {
        this.requestCounter += 1;
        return `asset-generation-${this.requestCounter}`;
    }

    private assertActive(): void {
        if (this.disposed) {
            throw new AssetGenerationError("invalid_request", "The generation worker is closed.");
        }
    }
}
