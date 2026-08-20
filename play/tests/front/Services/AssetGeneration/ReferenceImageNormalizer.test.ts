/* eslint-disable @typescript-eslint/require-await -- async test doubles implement browser normalization contracts */

import { describe, expect, it, vi } from "vitest";
import {
    EphemeralReferenceCollection,
    ReferenceImageNormalizer,
    type RasterReferenceReencoder,
} from "../../../../src/front/Services/AssetGeneration/ReferenceImageNormalizer";

describe("ReferenceImageNormalizer", () => {
    it("uses a decode-and-reencode boundary before exposing a provider reference", async () => {
        const reencode = vi.fn<RasterReferenceReencoder["reencode"]>(async () => ({
            blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }),
            width: 256,
            height: 256,
        }));
        const normalizer = new ReferenceImageNormalizer({ reencoder: { reencode } });
        const source = new Blob(["pixels plus private EXIF text"], { type: "image/png" });

        const normalized = await normalizer.normalize("reference-1", source, new AbortController().signal);

        expect(reencode).toHaveBeenCalledOnce();
        expect(normalized.id).toBe("reference-1");
        expect(normalized.role).toBe("object-reference");
        expect(await normalized.blob.text()).not.toContain("private EXIF text");
    });

    it("defaults new attachments to Object reference and preserves per-image overrides", async () => {
        const normalizer = new ReferenceImageNormalizer({
            reencoder: {
                reencode: async (blob) => ({ blob, width: 10, height: 10 }),
            },
        });
        let nextId = 0;
        const collection = new EphemeralReferenceCollection({
            normalizer,
            createId: () => `reference-${++nextId}`,
            objectUrls: { create: (blob) => `blob:${blob.size}:${nextId}`, revoke: vi.fn() },
        });

        await collection.add(new Blob(["object"], { type: "image/png" }), new AbortController().signal);
        await collection.add(
            new Blob(["style"], { type: "image/png" }),
            new AbortController().signal,
            "style-mood-guide",
        );
        collection.setRole("reference-1", "style-mood-guide");

        expect(collection.forGeneration().map(({ id, role }) => ({ id, role }))).toEqual([
            { id: "reference-1", role: "style-mood-guide" },
            { id: "reference-2", role: "style-mood-guide" },
        ]);
        collection.dispose();
    });

    it("revokes every object URL and drops blobs when the ephemeral session is disposed", async () => {
        const revoke = vi.fn();
        const normalizer = new ReferenceImageNormalizer({
            reencoder: {
                reencode: async () => ({
                    blob: new Blob(["normalized"], { type: "image/png" }),
                    width: 10,
                    height: 10,
                }),
            },
        });
        const collection = new EphemeralReferenceCollection({
            normalizer,
            createId: () => "reference-1",
            objectUrls: { create: () => "blob:ephemeral-reference", revoke },
        });

        await collection.add(new Blob(["source"], { type: "image/png" }), new AbortController().signal);
        expect(collection.forGeneration()).toHaveLength(1);

        collection.dispose();

        expect(revoke).toHaveBeenCalledWith("blob:ephemeral-reference");
        expect(() => collection.list()).toThrow("closed");
    });
});
