import type { TeapotPaidGenerationRequest } from "@workadventure/teapot-mcp/contracts";
import { describe, expect, it, vi } from "vitest";

import { TeapotMcpAssetPersistence } from "../../../src/front/Services/TeapotMcpAssetPersistence";

const candidate = {
    blob: new Blob(["png"], { type: "image/png" }),
    providerId: "openrouter" as const,
    modelId: "image-model",
};

function request(purpose: TeapotPaidGenerationRequest["purpose"], targetAssetClass: string) {
    return {
        purpose,
        prompt: "A useful asset",
        targetAssetClass,
        referenceCount: 0,
        output: {
            width: purpose === "avatar" || purpose === "avatar-part" ? 96 : purpose === "tileset" ? 32 : 256,
            height: purpose === "avatar" || purpose === "avatar-part" ? 128 : purpose === "tileset" ? 32 : 256,
            transparent: true,
            frameLayout:
                purpose === "avatar" || purpose === "avatar-part"
                    ? ("woka-3x4" as const)
                    : purpose === "tileset"
                      ? ("tileset" as const)
                      : ("single" as const),
        },
    } satisfies TeapotPaidGenerationRequest;
}

function createPersistence() {
    const wokaUpload = vi.fn(() =>
        Promise.resolve({
            id: "teapot-woka:woka_asset",
            name: "Moss hat",
            url: "/teapot/woka-assets/woka_asset.png",
            category: "hat" as const,
            active: false,
            createdAt: "2026-08-09T12:00:00.000Z",
        }),
    );
    const tilesetUpload = vi.fn(() =>
        Promise.resolve({
            id: "tileset_asset",
            name: "Forest",
            url: "/teapot/tileset-assets/tileset_asset.png",
            width: 32,
            height: 32,
            columns: 1,
            rows: 1,
            createdAt: "2026-08-09T12:00:00.000Z",
        }),
    );
    const generatedUpload = vi.fn((_blob: Blob, _name: string, kind: "map-entity" | "reference") =>
        Promise.resolve({
            id: `${kind}_asset`,
            name: "Generated",
            url: `/teapot/generated-assets/${kind}_asset.png`,
            kind,
            width: 256,
            height: 256,
            createdAt: "2026-08-09T12:00:00.000Z",
        }),
    );
    return {
        persistence: new TeapotMcpAssetPersistence(
            { upload: wokaUpload },
            { upload: tilesetUpload },
            { upload: generatedUpload },
            "https://play.example.test/",
        ),
        wokaUpload,
        tilesetUpload,
        generatedUpload,
    };
}

describe("TeapotMcpAssetPersistence", () => {
    it("persists a Woka component before returning bounded stable completion metadata", async () => {
        const { persistence, wokaUpload } = createPersistence();

        await expect(persistence.persist(request("avatar-part", "moss hat"), candidate)).resolves.toEqual({
            status: "accepted-asset",
            assetId: "woka_asset",
            assetUrl: "https://play.example.test/teapot/woka-assets/woka_asset.png",
            assetKind: "woka-part",
            providerId: "openrouter",
            modelId: "image-model",
            mediaType: "image/png",
            byteLength: 3,
        });
        expect(wokaUpload).toHaveBeenCalledWith(candidate.blob, "moss hat", "hat", undefined);
    });

    it("routes tilesets and map entities to their durable owner catalogs", async () => {
        const { persistence, tilesetUpload, generatedUpload } = createPersistence();

        await expect(persistence.persist(request("tileset", "forest tiles"), candidate)).resolves.toMatchObject({
            status: "accepted-asset",
            assetId: "tileset_asset",
            assetKind: "tileset",
        });
        await expect(persistence.persist(request("map-entity", "notice board"), candidate)).resolves.toMatchObject({
            status: "accepted-asset",
            assetId: "map-entity_asset",
            assetKind: "map-entity",
        });
        expect(tilesetUpload).toHaveBeenCalledOnce();
        expect(generatedUpload).toHaveBeenCalledWith(
            candidate.blob,
            "notice board",
            "map-entity",
            expect.objectContaining({ source: "generated", providerId: "openrouter" }),
            undefined,
        );
    });
});
