import CredentialWorker from "./generationCredentialWorker?worker&inline";
import { GenerationWorkerClient } from "./GenerationWorkerClient";

export function createBrowserGenerationWorkerClient(): GenerationWorkerClient {
    return new GenerationWorkerClient(new CredentialWorker());
}
