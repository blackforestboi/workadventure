// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { TeapotGeneratedAssetService } from "../../src/pusher/teapot/TeapotGeneratedAssetService";
import { InMemoryTeapotWokaObjectStore } from "../../src/pusher/teapot/TeapotWokaObjectStore";
import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { createTestWokaPng } from "./fixtures/createTestWokaPng";

describe("TeapotGeneratedAssetService", () => {
    let repository: InMemoryTeapotDataRepository;
    let service: TeapotGeneratedAssetService;

    beforeEach(() => {
        let nextId = 0;
        repository = new InMemoryTeapotDataRepository({ createId: () => `asset_${++nextId}` });
        const services = createTeapotDataServices(repository);
        service = new TeapotGeneratedAssetService(
            repository,
            services.identity,
            services.authorization,
            new InMemoryTeapotWokaObjectStore(),
            "https://play.example.test",
        );
    });

    it("durably stores map entities in an owner-scoped catalog with a stable public raster", async () => {
        const saved = await service.accept("owner-a", "Notice board", createTestWokaPng(), "map-entity", {
            source: "generated",
            providerId: "openrouter",
        });

        expect(saved).toMatchObject({
            id: "asset_3",
            kind: "map-entity",
            width: 96,
            height: 128,
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            url: "https://play.example.test/teapot/generated-assets/asset_3.png",
        });
        await expect(service.list("owner-a", "map-entity")).resolves.toEqual({ items: [saved] });
        await expect(service.list("owner-b", "map-entity")).resolves.toEqual({ items: [] });
        await expect(service.getPublicRaster(saved.id)).resolves.toMatchObject({
            bytes: expect.any(Buffer),
            etag: expect.stringMatching(/^[0-9a-f]{64}$/),
        });
        expect((await repository.getAsset(saved.id))?.published).toBe(true);
    });

    it("reuses the same owner and kind asset when its PNG fingerprint already exists", async () => {
        const png = createTestWokaPng();

        const first = await service.accept("owner-a", "First name", png, "map-entity");
        const duplicate = await service.accept("owner-a", "Second name", png, "map-entity");

        expect(duplicate).toEqual(first);
        const data = await repository.exportData();
        expect(data.assets).toHaveLength(1);
        expect(data.catalogAssets).toHaveLength(1);
    });

    it("does not reconcile matching PNGs across owners or asset kinds", async () => {
        const png = createTestWokaPng();

        const mapEntity = await service.accept("owner-a", "Map entity", png, "map-entity");
        const reference = await service.accept("owner-a", "Reference", png, "reference");
        const otherOwner = await service.accept("owner-b", "Other owner", png, "map-entity");

        expect(new Set([mapEntity.id, reference.id, otherOwner.id]).size).toBe(3);
        const data = await repository.exportData();
        expect(data.assets).toHaveLength(3);
        expect(data.catalogAssets).toHaveLength(3);
    });

    it("keeps reference and map-entity catalogs distinct and rejects malformed raster bytes", async () => {
        const reference = await service.accept("owner-a", "Style", createTestWokaPng(), "reference");

        await expect(service.list("owner-a", "map-entity")).resolves.toEqual({ items: [] });
        expect(reference.url).toBe("https://play.example.test/teapot/generated-assets/private/asset_3.png");
        expect((await repository.getAsset(reference.id))?.published).toBe(false);
        await expect(service.getPublicRaster(reference.id)).resolves.toBeNull();
        await expect(service.getOwnerRaster("owner-a", reference.id)).resolves.toMatchObject({
            bytes: expect.any(Buffer),
        });
        await expect(service.getOwnerRaster("owner-b", reference.id)).resolves.toBeNull();
        await expect(service.accept("owner-a", "Broken", Buffer.from("not png"), "map-entity")).rejects.toThrow(
            "must be a PNG",
        );
    });

    it("resolves an email provider subject without querying the UUID user-id column", async () => {
        const getIdentity = vi.spyOn(repository, "getIdentity");

        await expect(service.list("john.doe@example.com", "map-entity")).resolves.toEqual({ items: [] });
        expect(getIdentity).not.toHaveBeenCalledWith("john.doe@example.com");
    });
});
