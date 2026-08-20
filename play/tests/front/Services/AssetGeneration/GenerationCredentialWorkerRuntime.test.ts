import { describe, expect, it, vi } from "vitest";
import { DeterministicFakeImageProvider } from "../../../../src/front/Services/AssetGeneration/DeterministicFakeImageProvider";
import { GenerationCredentialWorkerRuntime } from "../../../../src/front/Services/AssetGeneration/GenerationCredentialWorkerRuntime";
import type { ImageGenerationProvider } from "../../../../src/front/Services/AssetGeneration/AssetGenerationTypes";
import type {
    GenerationWorkerRequest,
    GenerationWorkerResponse,
} from "../../../../src/front/Services/AssetGeneration/GenerationWorkerProtocol";

describe("GenerationCredentialWorkerRuntime", () => {
    it("accepts a credential for operations without providing any credential-read response", async () => {
        const runtime = new GenerationCredentialWorkerRuntime([new DeterministicFakeImageProvider()]);
        const responses: GenerationWorkerResponse[] = [];
        const secret = "worker-only-secret";

        await runtime.handleMessage(
            { type: "credential.configure", requestId: "configure-1", providerId: "fake", credential: secret },
            (response) => responses.push(response),
        );
        await runtime.handleMessage({ type: "models.list", requestId: "models-1", providerId: "fake" }, (response) =>
            responses.push(response),
        );
        await runtime.handleMessage(
            {
                type: "generation.execute",
                requestId: "generate-1",
                jobId: "job-1",
                batch: {
                    approvalId: "approval-1",
                    approvedAt: "2026-08-09T12:00:00.000Z",
                    metadata: {
                        providerId: "fake",
                        modelId: "fake/deterministic-image",
                        target: "environment-object",
                        outputCount: 1,
                        maximumCost: { kind: "known", currency: "USD", maximumAmount: 0 },
                    },
                    request: {
                        modelId: "fake/deterministic-image",
                        target: "environment-object",
                        prompt: "A tree",
                        descriptionRole: "object",
                        outputCount: 1,
                        references: [],
                    },
                },
            },
            (response) => responses.push(response),
        );

        expect(responses.some((response) => response.type === "models.result")).toBe(true);
        expect(responses.some((response) => response.type === "generation.result")).toBe(true);
        expect(JSON.stringify(responses)).not.toContain(secret);
    });

    it("generates a title alongside the image without exposing the credential", async () => {
        const provider = new DeterministicFakeImageProvider();
        const generateTitle = vi.fn(() => Promise.resolve("Mossy Notice Board"));
        (provider as ImageGenerationProvider).generateTitle = generateTitle;
        const runtime = new GenerationCredentialWorkerRuntime([provider]);
        const responses: GenerationWorkerResponse[] = [];

        await runtime.handleMessage(
            {
                type: "credential.configure",
                requestId: "configure-1",
                providerId: "fake",
                credential: "worker-only-secret",
            },
            (response) => responses.push(response),
        );
        await runtime.handleMessage(createGenerationMessage(), (response) => responses.push(response));

        expect(generateTitle).toHaveBeenCalledWith(
            "Original title prompt",
            "worker-only-secret",
            expect.any(AbortSignal),
        );
        expect(responses.find((response) => response.type === "generation.result")).toMatchObject({
            type: "generation.result",
            result: { title: "Mossy Notice Board" },
        });
        expect(JSON.stringify(responses)).not.toContain("worker-only-secret");
    });

    it("preserves mixed image and Description roles across the worker runtime", async () => {
        const provider = new DeterministicFakeImageProvider();
        const runtime = new GenerationCredentialWorkerRuntime([provider]);
        const responses: GenerationWorkerResponse[] = [];
        const message = createGenerationMessage();
        message.batch.request.descriptionRole = "style-mood";
        message.batch.request.references = [
            {
                id: "subject",
                blob: new Blob(["subject"], { type: "image/png" }),
                mimeType: "image/png",
                role: "object-reference",
            },
            {
                id: "vibe",
                blob: new Blob(["vibe"], { type: "image/webp" }),
                mimeType: "image/webp",
                role: "style-mood-guide",
            },
        ];

        await runtime.handleMessage(
            {
                type: "credential.configure",
                requestId: "configure-role-test",
                providerId: "fake",
                credential: "worker-only-secret",
            },
            (response) => responses.push(response),
        );
        await runtime.handleMessage(message, (response) => responses.push(response));

        expect(provider.lastRequest?.descriptionRole).toBe("style-mood");
        expect(provider.lastRequest?.references.map(({ id, role }) => ({ id, role }))).toEqual([
            { id: "subject", role: "object-reference" },
            { id: "vibe", role: "style-mood-guide" },
        ]);
        expect(responses.some((response) => response.type === "generation.result")).toBe(true);
    });
});

function createGenerationMessage(): Extract<GenerationWorkerRequest, { type: "generation.execute" }> {
    return {
        type: "generation.execute" as const,
        requestId: "generate-1",
        jobId: "job-1",
        batch: {
            approvalId: "approval-1",
            approvedAt: "2026-08-09T12:00:00.000Z",
            metadata: {
                providerId: "fake" as const,
                modelId: "fake/deterministic-image",
                target: "environment-object" as const,
                outputCount: 1,
                maximumCost: { kind: "known" as const, currency: "USD" as const, maximumAmount: 0 },
            },
            request: {
                modelId: "fake/deterministic-image",
                target: "environment-object" as const,
                prompt: "A tree",
                descriptionRole: "object",
                outputCount: 1,
                references: [],
            },
            titlePrompt: "Original title prompt",
        },
    };
}
