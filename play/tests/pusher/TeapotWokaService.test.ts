// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { InMemoryTeapotWokaObjectStore } from "../../src/pusher/teapot/TeapotWokaObjectStore";
import { TeapotWokaService } from "../../src/pusher/teapot/TeapotWokaService";
import { createTestWokaPng } from "./fixtures/createTestWokaPng";

describe("TeapotWokaService", () => {
    let repository: InMemoryTeapotDataRepository;
    let service: TeapotWokaService;

    beforeEach(() => {
        let nextId = 0;
        repository = new InMemoryTeapotDataRepository({ createId: () => `test_${++nextId}` });
        const dataServices = createTeapotDataServices(repository);
        service = new TeapotWokaService(
            repository,
            dataServices.identity,
            dataServices.authorization,
            new InMemoryTeapotWokaObjectStore(),
            { publicPusherUrl: "https://pusher.example.test" },
        );
    });

    it("atomically accepts a Woka into the owner's catalog and makes it active", async () => {
        const accepted = await service.accept("owner-a", "  Forest Fox  ", createTestWokaPng());

        expect(accepted).toMatchObject({
            id: "teapot-woka:test_3",
            name: "Forest Fox",
            category: "woka",
            active: true,
            url: "https://pusher.example.test/teapot/woka-assets/test_3.png?frameWidth=32&frameHeight=32",
        });
        const list = await service.list("owner-a");
        expect(list.activeTextureId).toBe(accepted.id);
        expect(list.items).toEqual([accepted]);

        const exported = await repository.exportData();
        expect(exported.catalogs).toHaveLength(1);
        expect(exported.catalogAssets).toHaveLength(1);
        expect(exported.activeWokaSelections).toEqual([
            expect.objectContaining({ ownerId: "test_1", assetId: "test_3" }),
        ]);
        const restored = new InMemoryTeapotDataRepository();
        await restored.restoreData(exported);
        await expect(restored.getActiveWokaSelection("test_1")).resolves.toEqual(
            expect.objectContaining({ ownerId: "test_1", assetId: "test_3" }),
        );
    });

    it("keeps generated Wokas private to their owner during join-time resolution", async () => {
        const accepted = await service.accept("owner-a", "Forest Fox", createTestWokaPng());

        await expect(service.resolveGeneratedWokaDetails("owner-a", [accepted.id])).resolves.toEqual([
            { id: accepted.id, url: accepted.url },
        ]);
        await expect(service.resolveGeneratedWokaDetails("owner-b", [accepted.id])).resolves.toBeUndefined();
        await expect(service.list("owner-b")).resolves.toEqual({ items: [], activeTextureId: null });
    });

    it("resolves an email-shaped WorkAdventure subject through its provider identity", async () => {
        const subject = "john.doe@example.com";
        const accepted = await service.accept(subject, "Forest Fox", createTestWokaPng());

        await expect(service.list(subject)).resolves.toMatchObject({
            activeTextureId: accepted.id,
            items: [{ id: accepted.id }],
        });
    });

    it("catalogs complete avatars and composable parts in their own editor layers", async () => {
        const complete = await service.accept("owner-a", "Forest Fox", createTestWokaPng());
        const hat = await service.accept("owner-a", "Moss Hat", createTestWokaPng(), "hat");

        await expect(service.listTextures("owner-a", "woka")).resolves.toEqual([
            { id: complete.id, name: complete.name, url: complete.url },
        ]);
        await expect(service.listTextures("owner-a", "hat")).resolves.toEqual([
            { id: hat.id, name: hat.name, url: hat.url },
        ]);
        await expect(service.listTexturesByCategory("owner-a")).resolves.toMatchObject({
            woka: [{ id: complete.id }],
            hat: [{ id: hat.id }],
            body: [],
        });
        await expect(service.resolveGeneratedWokaDetails("owner-a", [complete.id, hat.id])).resolves.toEqual([
            { id: complete.id, url: complete.url },
            { id: hat.id, url: hat.url },
        ]);
        await expect(service.resolveGeneratedWokaDetails("owner-a", [hat.id], ["woka"])).resolves.toBeUndefined();
        await expect(service.resolveGeneratedWokaDetails("owner-a", [hat.id], ["hat"])).resolves.toEqual([
            { id: hat.id, url: hat.url },
        ]);
    });

    it("keeps layered parts out of the whole-avatar active fallback", async () => {
        const complete = await service.accept("owner-a", "Forest Fox", createTestWokaPng());
        const hat = await service.accept("owner-a", "Moss Hat", createTestWokaPng(), "hat");

        expect(hat.active).toBe(false);
        expect(await service.list("owner-a")).toMatchObject({
            activeTextureId: complete.id,
            items: [
                { id: complete.id, active: true },
                { id: hat.id, active: false },
            ],
        });

        await expect(service.select("owner-a", hat.id)).resolves.toMatchObject({
            id: hat.id,
            category: "hat",
            active: false,
        });
        await expect(repository.selectWoka("test_1", hat.id.replace("teapot-woka:", ""))).rejects.toThrow(
            "does not exist for this owner",
        );
        expect((await service.list("owner-a")).activeTextureId).toBe(complete.id);
        expect((await repository.exportData()).activeWokaSelections).toEqual([
            expect.objectContaining({
                assetId: complete.id.replace("teapot-woka:", ""),
            }),
        ]);
    });

    it("selects and deletes only owned Wokas without disturbing the previous asset", async () => {
        const first = await service.accept("owner-a", "First", createTestWokaPng());
        const second = await service.accept("owner-a", "Second", createTestWokaPng());

        expect((await service.list("owner-a")).activeTextureId).toBe(second.id);
        await service.select("owner-a", first.id);
        expect((await service.list("owner-a")).activeTextureId).toBe(first.id);

        await service.delete("owner-a", first.id);
        expect(await service.list("owner-a")).toMatchObject({
            activeTextureId: null,
            items: [{ id: second.id, active: false }],
        });
        await expect(service.resolveGeneratedWokaDetails("owner-a", [first.id])).resolves.toBeUndefined();
        await expect(service.getPublicRaster(first.id.replace("teapot-woka:", ""))).resolves.toBeNull();
        await expect(service.getPublicRaster(second.id.replace("teapot-woka:", ""))).resolves.toMatchObject({
            etag: expect.stringMatching(/^[0-9a-f]{64}$/),
        });
    });

    it("refuses cross-owner selection and deletion", async () => {
        const accepted = await service.accept("owner-a", "Forest Fox", createTestWokaPng());

        await expect(service.select("owner-b", accepted.id)).rejects.toThrow("does not exist for this owner");
        await expect(service.delete("owner-b", accepted.id)).rejects.toThrow("does not exist for this owner");
    });
});
