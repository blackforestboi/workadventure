// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { TeapotWokaCategory } from "../../src/common/Teapot/TeapotWoka";
import { LocalWokaService } from "../../src/pusher/services/LocalWokaService";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { InMemoryTeapotWokaObjectStore } from "../../src/pusher/teapot/TeapotWokaObjectStore";
import type { TeapotWokaView } from "../../src/pusher/teapot/TeapotWokaService";
import { TeapotWokaService } from "../../src/pusher/teapot/TeapotWokaService";
import { createTestWokaPng } from "./fixtures/createTestWokaPng";

describe("LocalWokaService generated selection resolution", () => {
    it("resolves an owned six-layer selection and rejects a generated sheet in the wrong layer", async () => {
        const repository = new InMemoryTeapotDataRepository();
        const dataServices = createTeapotDataServices(repository);
        const generated = new TeapotWokaService(
            repository,
            dataServices.identity,
            dataServices.authorization,
            new InMemoryTeapotWokaObjectStore(),
            { publicPusherUrl: "https://play.example.test" },
        );
        const categories: TeapotWokaCategory[] = ["body", "eyes", "hair", "clothes", "hat", "accessory"];
        const assets: TeapotWokaView[] = [];
        for (const category of categories) {
            // eslint-disable-next-line no-await-in-loop -- preserve deterministic catalog insertion order
            assets.push(await generated.accept("owner-a", category, createTestWokaPng(), category));
        }
        const service = new LocalWokaService();
        service.setGeneratedWokaService(generated);

        await expect(
            service.fetchWokaDetails(
                assets.map((asset) => asset.id),
                "owner-a",
            ),
        ).resolves.toEqual(assets.map((asset) => ({ id: asset.id, url: asset.url })));

        const wrongLayer = [...assets.map((asset) => asset.id)];
        [wrongLayer[0], wrongLayer[4]] = [wrongLayer[4], wrongLayer[0]];
        await expect(service.fetchWokaDetails(wrongLayer, "owner-a")).resolves.toBeUndefined();
    });
});
