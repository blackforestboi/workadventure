/* eslint-disable @typescript-eslint/require-await -- async fetch doubles implement the browser signature */

import { describe, expect, it, vi } from "vitest";

import { HostedCliImageProvider } from "../../../../src/front/Services/AssetGeneration/HostedCliImageProvider";

describe("HostedCliImageProvider", () => {
    it("lists models through the authenticated same-origin Codex route", async () => {
        const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
            Response.json({ models: [{ id: "gpt-image", name: "Codex image", description: "Subscription model" }] }),
        );
        const provider = new HostedCliImageProvider("codex", { fetcher });

        await expect(provider.listModels("teapot-auth-token", new AbortController().signal)).resolves.toMatchObject([
            { id: "gpt-image", name: "Codex image", outputModalities: ["image"] },
        ]);
        expect(fetcher).toHaveBeenCalledWith(
            "/teapot/ai/providers/codex/models",
            expect.objectContaining({
                headers: { Authorization: "teapot-auth-token" },
                credentials: "same-origin",
                cache: "no-store",
            }),
        );
    });

    it("sends one approved generation to the owner-scoped cloud bridge", async () => {
        const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
            Response.json({
                base64: "aW1hZ2U=",
                mimeType: "image/png",
                model: "gpt-image",
                requestId: "request-1",
            }),
        );
        const provider = new HostedCliImageProvider("codex", { fetcher });

        const result = await provider.generate(
            {
                modelId: "gpt-image",
                target: "woka-body",
                prompt: "A blue coat",
                descriptionRole: "object",
                outputCount: 1,
                references: [
                    {
                        id: "local-object-path",
                        blob: new Blob(["object"], { type: "image/png" }),
                        mimeType: "image/png",
                        role: "object-reference",
                    },
                    {
                        id: "local-style-path",
                        blob: new Blob(["style"], { type: "image/png" }),
                        mimeType: "image/png",
                        role: "style-mood-guide",
                    },
                ],
            },
            "teapot-auth-token",
            new AbortController().signal,
        );

        expect(result.assets[0]?.blob.type).toBe("image/png");
        expect(result.provenance).toMatchObject({
            providerId: "codex-cli",
            modelId: "gpt-image",
            providerRequestId: "request-1",
        });
        expect(fetcher).toHaveBeenCalledWith(
            "/teapot/ai/providers/codex/generate",
            expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store" }),
        );
        const init = fetcher.mock.calls[0]?.[1];
        if (typeof init?.body !== "string") throw new Error("Expected a serialized hosted CLI request body");
        const body = JSON.parse(init.body) as { prompt: string; [key: string]: unknown };
        expect(body).toMatchObject({
            model: "gpt-image",
            target: "woka-layer",
            references: [
                { name: "reference-1.png", role: "object-reference" },
                { name: "reference-2.png", role: "style-mood-guide" },
            ],
        });
        expect(body.prompt).toContain('USER_DESCRIPTION_JSON "A blue coat"');
        expect(body.prompt).toContain("reference-2 (style-mood-guide)");
        expect(JSON.stringify(body)).not.toContain("local-object-path");
        expect(JSON.stringify(body)).not.toContain("local-style-path");
    });

    it("never attempts a hosted request without the Teapot bearer", async () => {
        const fetcher = vi.fn();
        const provider = new HostedCliImageProvider("claude", { fetcher });

        await expect(provider.listModels("", new AbortController().signal)).rejects.toMatchObject({
            code: "missing_credential",
        });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("shows the bridge's bounded generation diagnosis", async () => {
        const fetcher = vi.fn(async () =>
            Response.json(
                { error: "Codex is connected, but its image-generation tool is unavailable in this runtime" },
                { status: 502 },
            ),
        );
        const provider = new HostedCliImageProvider("codex", { fetcher });

        await expect(
            provider.generate(
                {
                    modelId: "gpt-5.6",
                    target: "woka-body",
                    prompt: "A blue coat",
                    descriptionRole: "object",
                    outputCount: 1,
                    references: [],
                },
                "teapot-auth-token",
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({
            code: "provider_error",
            message: "Codex is connected, but its image-generation tool is unavailable in this runtime",
            retryable: true,
        });
    });
});
