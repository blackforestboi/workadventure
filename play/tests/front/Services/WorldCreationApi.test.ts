import { describe, expect, it, vi } from "vitest";

import { WorldCreationApi } from "../../../src/front/Services/WorldCreationApi";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const result = {
    roomUrl: "https://play.example.test/~/worlds/world-1/maps/world.wam",
    wamUrl: "https://play.example.test/map-storage/worlds/world-1/maps/world.wam",
    mapUrl: "https://play.example.test/map-storage/worlds/world-1/maps/world.tmj",
};

describe("WorldCreationApi", () => {
    it("creates a world through the authenticated pusher boundary", async () => {
        const fetcher = vi.fn<Fetcher>(() =>
            Promise.resolve(
                new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } }),
            ),
        );
        const api = new WorldCreationApi("https://play.example.test/", () => "private-token", fetcher);
        const sourceRoomUrl = "https://play.example.test/~/maps/source.wam";

        await expect(api.create(sourceRoomUrl)).resolves.toEqual(result);

        const [url, init] = fetcher.mock.calls[0];
        expect(url).toEqual(new URL("https://play.example.test/teapot/worlds"));
        expect(init).toMatchObject({
            method: "POST",
            credentials: "include",
            cache: "no-store",
            body: JSON.stringify({ sourceRoomUrl }),
        });
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("private-token");
        expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("surfaces server errors and requires a signed-in user", async () => {
        const fetcher = vi.fn<Fetcher>(() =>
            Promise.resolve(
                new Response(JSON.stringify({ error: "Map storage is unavailable" }), {
                    status: 502,
                    headers: { "Content-Type": "application/json" },
                }),
            ),
        );
        const api = new WorldCreationApi("https://play.example.test/", () => "private-token", fetcher);
        await expect(api.create("https://play.example.test/~/maps/source.wam")).rejects.toThrow(
            "Map storage is unavailable",
        );

        const signedOutApi = new WorldCreationApi("https://play.example.test/", () => null, fetcher);
        await expect(signedOutApi.create("https://play.example.test/~/maps/source.wam")).rejects.toThrow(
            "Sign in before creating a world",
        );
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
