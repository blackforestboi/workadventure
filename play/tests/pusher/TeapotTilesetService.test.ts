// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { TeapotTilesetService } from "../../src/pusher/teapot/TeapotTilesetService";
import { InMemoryTeapotWokaObjectStore } from "../../src/pusher/teapot/TeapotWokaObjectStore";
import { createTestWokaPng } from "./fixtures/createTestWokaPng";

describe("TeapotTilesetService", () => {
    let repository: InMemoryTeapotDataRepository;
    let service: TeapotTilesetService;

    beforeEach(() => {
        let nextId = 0;
        repository = new InMemoryTeapotDataRepository({ createId: () => `tileset_${++nextId}` });
        const services = createTeapotDataServices(repository);
        service = new TeapotTilesetService(
            repository,
            services.identity,
            services.authorization,
            new InMemoryTeapotWokaObjectStore(),
            "https://pusher.example.test",
        );
    });

    it("accepts a single terrain tile into the owner's existing terrain catalog", async () => {
        const first = await service.accept("owner-a", "Forest floor", createTestWokaPng({ width: 32, height: 32 }), {
            source: "imported",
        });
        const second = await service.accept("owner-a", "Stone floor", createTestWokaPng({ width: 32, height: 32 }), {
            source: "generated",
        });

        expect(first).toMatchObject({
            id: "tileset_3",
            name: "Forest floor",
            url: "https://pusher.example.test/teapot/tileset-assets/tileset_3.png",
            width: 32,
            height: 32,
            columns: 1,
            rows: 1,
        });
        await expect(service.list("owner-a")).resolves.toMatchObject({ items: [first, second] });
        const data = await repository.exportData();
        expect(data.catalogs).toHaveLength(1);
        expect(data.assets).toEqual([
            expect.objectContaining({ kind: "tileset", ownerId: "tileset_1", published: true }),
            expect.objectContaining({ kind: "tileset", ownerId: "tileset_1", published: true }),
        ]);
        expect(data.catalogAssets).toHaveLength(2);
    });

    it("keeps list access owner-scoped while serving only published tileset bytes by opaque id", async () => {
        const accepted = await service.accept("owner-a", "Forest floor", createTestWokaPng({ width: 32, height: 32 }));

        await expect(service.list("owner-b")).resolves.toEqual({ items: [] });
        await expect(service.getPublicRaster(accepted.id)).resolves.toMatchObject({
            bytes: expect.any(Buffer),
            etag: expect.stringMatching(/^[0-9a-f]{64}$/),
        });
        await expect(service.getPublicRaster("../private-file")).resolves.toBeNull();
    });

    it("accepts a validated animated strip and rejects dimensions outside its metadata", async () => {
        await expect(service.accept("owner-a", "Broken", createTestWokaPng({ width: 95 }))).rejects.toThrow(
            "grid-aligned 32×32px tiles",
        );
        const animation = {
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 4,
            frameDurationMs: 200,
        };
        const accepted = await service.accept(
            "owner-a",
            "Moving water",
            createTestWokaPng({ width: 128, height: 32 }),
            { source: "generated" },
            animation,
        );
        expect(accepted).toMatchObject({ columns: 4, rows: 1, animation });
        await expect(
            service.accept(
                "owner-a",
                "Mismatched water",
                createTestWokaPng({ width: 64, height: 32 }),
                { source: "generated" },
                animation,
            ),
        ).rejects.toThrow("metadata must match");
    });
});
