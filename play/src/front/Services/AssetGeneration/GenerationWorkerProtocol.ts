import type {
    ApprovedAssetGenerationBatch,
    AssetGenerationErrorPayload,
    AssetGenerationLifecycleEvent,
    AssetGenerationModel,
    AssetGenerationProviderId,
    AssetGenerationResult,
} from "./AssetGenerationTypes";

export type GenerationWorkerRequest =
    | {
          type: "credential.configure";
          requestId: string;
          providerId: AssetGenerationProviderId;
          credential: string;
      }
    | {
          type: "credential.clear";
          requestId: string;
          providerId?: AssetGenerationProviderId;
      }
    | {
          type: "models.list";
          requestId: string;
          providerId: AssetGenerationProviderId;
      }
    | {
          type: "generation.execute";
          requestId: string;
          jobId: string;
          batch: ApprovedAssetGenerationBatch;
      }
    | {
          type: "generation.cancel";
          requestId: string;
          jobId: string;
      }
    | {
          type: "runtime.dispose";
          requestId: string;
      };

export type GenerationWorkerResponse =
    | {
          type: "operation.complete";
          requestId: string;
      }
    | {
          type: "models.result";
          requestId: string;
          models: readonly AssetGenerationModel[];
      }
    | {
          type: "generation.lifecycle";
          requestId: string;
          jobId: string;
          event: AssetGenerationLifecycleEvent;
      }
    | {
          type: "generation.result";
          requestId: string;
          jobId: string;
          result: AssetGenerationResult;
      }
    | {
          type: "operation.error";
          requestId: string;
          jobId?: string;
          error: AssetGenerationErrorPayload;
      };

/**
 * Intentionally no credential-read request or response exists. Credentials can only be configured,
 * consumed by an operation inside the worker, cleared, or destroyed with the worker runtime.
 */
export interface GenerationWorkerCredentialState {
    providerId: AssetGenerationProviderId;
    configured: boolean;
}
