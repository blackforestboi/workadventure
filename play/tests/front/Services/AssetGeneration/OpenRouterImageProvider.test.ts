/* eslint-disable @typescript-eslint/require-await -- async test doubles implement Fetch-compatible signatures */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovedGenerationService } from "../../../../src/front/Services/AssetGeneration/ApprovedGenerationService";
import { AssetGenerationError } from "../../../../src/front/Services/AssetGeneration/AssetGenerationError";
import { encodeBase64 } from "../../../../src/front/Services/AssetGeneration/Base64";
import { DeterministicFakeImageProvider } from "../../../../src/front/Services/AssetGeneration/DeterministicFakeImageProvider";
import {
    OPENROUTER_GENERATION_MODEL_ID,
    OpenRouterImageProvider,
    type AssetGenerationFetch,
} from "../../../../src/front/Services/AssetGeneration/OpenRouterImageProvider";
import type {
    ApprovedAssetGenerationBatch,
    AssetGenerationRequest,
} from "../../../../src/front/Services/AssetGeneration/AssetGenerationTypes";

const MINIMAL_WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("OpenRouterImageProvider", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("offers only Nano Banana 2 after validating the OpenRouter key", async () => {
        const fetcher = vi.fn<AssetGenerationFetch>(async () => jsonResponse({ data: { label: "test key" } }));

        const models = await new OpenRouterImageProvider({ fetcher }).listModels(
            "private-openrouter-key",
            new AbortController().signal,
        );

        expect(models).toEqual([
            expect.objectContaining({
                id: OPENROUTER_GENERATION_MODEL_ID,
                name: "Nano Banana 2",
            }),
        ]);
        expect(fetcher.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/key");
    });

    it("does not present a rejected key as connected", async () => {
        const provider = new OpenRouterImageProvider({
            fetcher: async () => jsonResponse({ error: { message: "Invalid API key" } }, 401),
        });

        await expect(provider.listModels("invalid-key", new AbortController().signal)).rejects.toMatchObject({
            code: "authentication_failed",
            httpStatus: 401,
            message: "The provider rejected this credential. Invalid API key",
        });
    });

    it("returns raster bytes with provider provenance and actual cost", async () => {
        const fetcher = vi.fn<AssetGenerationFetch>(async () =>
            jsonResponse(
                {
                    id: "chat-123",
                    created: 1_700_000_000,
                    choices: [
                        {
                            message: {
                                content: [
                                    {
                                        type: "image_url",
                                        image_url: { url: `data:image/webp;base64,${encodeBase64(MINIMAL_WEBP)}` },
                                    },
                                ],
                            },
                        },
                    ],
                    usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, cost: 0.04 },
                },
                200,
                { "x-request-id": "request-123" },
            ),
        );
        const provider = new OpenRouterImageProvider({ fetcher, transport: "chat-with-reasoning" });

        const result = await provider.generate(createRequest(), "private-openrouter-key", new AbortController().signal);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(result.assets).toHaveLength(1);
        expect(result.assets[0].blob.type).toBe("image/webp");
        expect(new Uint8Array(await result.assets[0].blob.arrayBuffer())).toEqual(MINIMAL_WEBP);
        const serializedRequest = fetcher.mock.calls[0]?.[1]?.body;
        if (typeof serializedRequest !== "string") throw new Error("Expected a serialized OpenRouter request body");
        const requestBody = JSON.parse(serializedRequest) as {
            model: string;
            modalities: string[];
            reasoning: { effort: string; exclude: boolean };
            image_config: { aspect_ratio: string };
            messages: { role: string; content: string | unknown[] }[];
        };
        expect(fetcher.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
        expect(requestBody.model).toBe(OPENROUTER_GENERATION_MODEL_ID);
        expect(requestBody.modalities).toEqual(["text", "image"]);
        expect(requestBody.reasoning).toEqual({ effort: "low", exclude: true });
        expect(requestBody.image_config).toEqual({ aspect_ratio: "1:1" });
        expect(requestBody.messages[0]).toMatchObject({
            role: "system",
            content: expect.stringContaining("Step B from Step A"),
        });
        expect(requestBody.messages[1]?.content).toHaveLength(1);
        expect(requestBody.messages[1]?.content[0]).toMatchObject({
            type: "text",
            text: expect.stringContaining("uniform chroma background for easy removal"),
        });
        expect(result.provenance).toEqual({
            providerId: "openrouter",
            modelId: OPENROUTER_GENERATION_MODEL_ID,
            providerRequestId: "request-123",
            providerCreatedAt: "2023-11-14T22:13:20.000Z",
        });
        expect(result.usage.actualCost).toEqual({ currency: "USD", amount: 0.04 });
    });

    it("sends supplied reference images to Nano Banana 2", async () => {
        const fetcher = vi.fn<AssetGenerationFetch>(async () =>
            jsonResponse({
                data: [{ b64_json: encodeBase64(MINIMAL_WEBP), media_type: "image/webp" }],
            }),
        );
        const provider = new OpenRouterImageProvider({ fetcher });
        const request = createRequest();
        request.references = [
            { id: "pose", blob: new Blob(["pose"], { type: "image/png" }), mimeType: "image/png" },
            { id: "character", blob: new Blob(["character"], { type: "image/webp" }), mimeType: "image/webp" },
            { id: "style", blob: new Blob(["style"], { type: "image/jpeg" }), mimeType: "image/jpeg" },
        ];

        await provider.generate(request, "private-openrouter-key", new AbortController().signal);

        const serializedRequest = fetcher.mock.calls[0]?.[1]?.body;
        if (typeof serializedRequest !== "string") throw new Error("Expected a serialized OpenRouter request body");
        const requestBody = JSON.parse(serializedRequest) as { input_references: unknown[] };
        expect(requestBody.input_references).toHaveLength(3);
    });

    it("uses the established dedicated Image API by default", async () => {
        const fetcher = vi.fn<AssetGenerationFetch>(async () =>
            jsonResponse({ data: [{ b64_json: encodeBase64(MINIMAL_WEBP), media_type: "image/webp" }] }),
        );
        const provider = new OpenRouterImageProvider({ fetcher });

        await provider.generate(createRequest(), "private-openrouter-key", new AbortController().signal);

        const serializedRequest = fetcher.mock.calls[0]?.[1]?.body;
        if (typeof serializedRequest !== "string") throw new Error("Expected a serialized OpenRouter request body");
        const requestBody = JSON.parse(serializedRequest) as {
            resolution: string;
            aspect_ratio: string;
            prompt: string;
        };
        expect(fetcher.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/images");
        expect(requestBody.resolution).toBe("512");
        expect(requestBody.aspect_ratio).toBe("1:1");
        expect(requestBody.prompt).toContain("uniform chroma background for easy removal");
    });

    it.each([
        [401, "authentication_failed"],
        [429, "rate_limited"],
    ] as const)("redacts a %s response without exposing its body", async (status, code) => {
        const providerSecret = "sk-or-secret-value";
        const fetcher: AssetGenerationFetch = async () =>
            new Response(JSON.stringify({ error: `provider echoed ${providerSecret}` }), {
                status,
                headers: { "Content-Type": "application/json" },
            });
        const provider = new OpenRouterImageProvider({ fetcher });

        let receivedError: unknown;
        try {
            await provider.generate(createRequest(), providerSecret, new AbortController().signal);
        } catch (error: unknown) {
            receivedError = error;
        }

        if (!(receivedError instanceof AssetGenerationError)) {
            throw new Error("Expected an AssetGenerationError");
        }
        expect(receivedError).toMatchObject({ code, httpStatus: status });
        expect(JSON.stringify(receivedError)).not.toContain(providerSecret);
        expect(receivedError.message).not.toContain(providerSecret);
    });

    it("shows a safe status for a rejected Recraft request", async () => {
        const provider = new OpenRouterImageProvider({
            fetcher: async () => jsonResponse({ error: { message: "Input image is too small" } }, 400),
        });

        await expect(
            provider.generate(createRequest(), "private-openrouter-key", new AbortController().signal),
        ).rejects.toMatchObject({
            code: "provider_error",
            httpStatus: 400,
            message: "The provider rejected this image request (HTTP 400). Input image is too small",
        });
    });

    it("cancels the in-flight request through AbortSignal", async () => {
        const fetcher: AssetGenerationFetch = async (_input, init) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
                    once: true,
                });
            });
        const provider = new OpenRouterImageProvider({ fetcher });
        const controller = new AbortController();

        const generation = provider.generate(createRequest(), "private-openrouter-key", controller.signal);
        controller.abort();

        await expect(generation).rejects.toMatchObject({ code: "cancelled" });
    });

    it("rejects malformed or non-raster output", async () => {
        const fetcher: AssetGenerationFetch = async () => jsonResponse({ data: [{}] });
        const provider = new OpenRouterImageProvider({ fetcher });

        await expect(
            provider.generate(createRequest(), "private-openrouter-key", new AbortController().signal),
        ).rejects.toMatchObject({ code: "malformed_response" });
    });

    it("uses one approval for exactly one provider batch", async () => {
        const provider = new DeterministicFakeImageProvider();
        const service = new ApprovedGenerationService(provider);
        const batch = createBatch("fake", "fake/deterministic-image");

        const result = await service.generate(batch, "unused", new AbortController().signal);

        expect(result.assets).toHaveLength(1);
        await expect(service.generate(batch, "unused", new AbortController().signal)).rejects.toMatchObject({
            code: "approval_already_consumed",
        });
    });
});

function createRequest(modelId = OPENROUTER_GENERATION_MODEL_ID): AssetGenerationRequest {
    return {
        modelId,
        target: "environment-object",
        prompt: "A transparent teapot-shaped tree",
        outputCount: 1,
        references: [],
        outputFormat: "webp",
        background: "transparent",
    };
}

function createBatch(providerId: "fake", modelId: string): ApprovedAssetGenerationBatch {
    return {
        approvalId: "approval-1",
        approvedAt: "2026-08-09T12:00:00.000Z",
        metadata: {
            providerId,
            modelId,
            target: "environment-object",
            outputCount: 1,
            maximumCost: { kind: "known", currency: "USD", maximumAmount: 0 },
        },
        request: createRequest(modelId),
    };
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
    const responseHeaders = new Headers(headers);
    responseHeaders.set("Content-Type", "application/json");
    return new Response(JSON.stringify(body), {
        status,
        headers: responseHeaders,
    });
}
