import { GenerationCredentialWorkerRuntime } from "./GenerationCredentialWorkerRuntime";
import { OpenRouterImageProvider } from "./OpenRouterImageProvider";
import { HostedCliImageProvider } from "./HostedCliImageProvider";
import type { GenerationWorkerRequest, GenerationWorkerResponse } from "./GenerationWorkerProtocol";

interface WorkerScope {
    postMessage(message: GenerationWorkerResponse): void;
    onmessage: ((event: MessageEvent<GenerationWorkerRequest>) => void) | null;
}

const workerScope = self as unknown as WorkerScope;
// Vite inlines this worker as a blob. Relative fetch URLs from a blob worker
// have no reliable page base, so make hosted-provider requests page-origin
// absolute before they cross the worker boundary.
const hostedProviderBaseUrl = globalThis.location.origin;
const runtime = new GenerationCredentialWorkerRuntime([
    new OpenRouterImageProvider(),
    new HostedCliImageProvider("codex", { baseUrl: hostedProviderBaseUrl }),
    new HostedCliImageProvider("claude", { baseUrl: hostedProviderBaseUrl }),
]);

workerScope.onmessage = (event) => {
    runtime.handleMessage(event.data, (response) => workerScope.postMessage(response)).catch(() => undefined);
};
