// @vitest-environment node
/* eslint-disable @typescript-eslint/require-await -- synchronous test double implements the asynchronous Woka service contract */

import { describe, expect, it } from "vitest";
import type { WokaList } from "@workadventure/messages";

import { GeneratedWokaOverlayService } from "../../src/pusher/services/GeneratedWokaOverlayService";
import type { WokaServiceInterface } from "../../src/pusher/services/WokaServiceInterface";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { InMemoryTeapotWokaObjectStore } from "../../src/pusher/teapot/TeapotWokaObjectStore";
import { TeapotWokaService } from "../../src/pusher/teapot/TeapotWokaService";
import { createTestWokaPng } from "./fixtures/createTestWokaPng";

describe("GeneratedWokaOverlayService", () => {
    it("adds each owned generated sheet to the matching editor layer", async () => {
        const repository = new InMemoryTeapotDataRepository();
        const dataServices = createTeapotDataServices(repository);
        const generated = new TeapotWokaService(
            repository,
            dataServices.identity,
            dataServices.authorization,
            new InMemoryTeapotWokaObjectStore(),
            { publicPusherUrl: "https://play.example.test" },
        );
        const complete = await generated.accept("owner-a", "Whole avatar", createTestWokaPng());
        const hat = await generated.accept("owner-a", "Moss hat", createTestWokaPng(), "hat");
        const baseList: WokaList = {
            woka: { collections: [{ name: "Built in", textures: [] }] },
            hat: { collections: [{ name: "Built in hats", textures: [] }] },
        };
        const base: WokaServiceInterface = { getWokaList: async () => baseList };

        const result = await new GeneratedWokaOverlayService(base, generated).getWokaList("room", "owner-a");

        expect(result?.woka.collections.at(-1)).toEqual({
            name: "Generated",
            textures: [{ id: complete.id, name: complete.name, url: complete.url }],
        });
        expect(result?.hat.collections.at(-1)).toEqual({
            name: "Generated",
            textures: [{ id: hat.id, name: hat.name, url: hat.url }],
        });
    });
});
