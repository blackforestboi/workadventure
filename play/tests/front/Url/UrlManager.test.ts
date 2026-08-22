import { afterEach, describe, expect, it, vi } from "vitest";

import type { Room } from "../../../src/front/Connection/Room";
import { GameConnexionTypes, urlManager } from "../../../src/front/Url/UrlManager";

const originalFrontUrl = window.env.FRONT_URL;

const roomForPath = (path: string, search = new URLSearchParams()): Room =>
    ({
        id: path.replace(/^\//, ""),
        href: `http://play.workadventure.localhost${path}`,
        search,
    }) as unknown as Room;

describe("UrlManager", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        window.env.FRONT_URL = originalFrontUrl;
        window.history.replaceState({}, "", "/");
    });

    it("does not add a history entry when a scene reconnects to the current room", () => {
        const path = "/~/worlds/example/maps/world.wam";
        window.history.replaceState({}, "", path);
        const pushState = vi.spyOn(window.history, "pushState");

        urlManager.pushRoomIdToUrl(roomForPath(path));

        expect(pushState).not.toHaveBeenCalled();
    });

    it("adds a history entry when entering a different room", () => {
        const path = "/~/worlds/example/maps/world.wam";
        const nextPath = "/~/worlds/next/maps/world.wam";
        window.history.replaceState({}, "", path);
        const pushState = vi.spyOn(window.history, "pushState");

        urlManager.pushRoomIdToUrl(roomForPath(nextPath));

        expect(pushState).toHaveBeenCalledWith({}, expect.any(String), nextPath);
        expect(window.location.pathname).toBe(nextPath);
    });

    it.each(["/play", "/play/"])("treats the configured landing path %s as a deterministic room entry", (path) => {
        window.env.FRONT_URL = "https://olivers.tools/play";
        window.history.replaceState({}, "", path);

        expect(urlManager.getGameConnexionType()).toBe(GameConnexionTypes.room);
    });

    it("classifies routes relative to the configured frontend path", () => {
        window.env.FRONT_URL = "https://olivers.tools/play";

        window.history.replaceState({}, "", "/play/login");
        expect(urlManager.getGameConnexionType()).toBe(GameConnexionTypes.login);

        window.history.replaceState({}, "", "/play/~/maps/empty.wam");
        expect(urlManager.getGameConnexionType()).toBe(GameConnexionTypes.room);

        window.history.replaceState({}, "", "/playground");
        expect(urlManager.getGameConnexionType()).toBe(GameConnexionTypes.unknown);
    });

    it("prefixes room history exactly once and preserves query and hash", () => {
        window.env.FRONT_URL = "https://olivers.tools/play";
        window.history.replaceState({}, "", "/play");
        const room = roomForPath("/~/maps/empty.wam", new URLSearchParams("invite=1"));
        window.location.hash = "spawn";

        urlManager.pushRoomIdToUrl(room);

        expect(window.location.pathname).toBe("/play/~/maps/empty.wam");
        expect(window.location.search).toBe("?invite=1");
        expect(window.location.hash).toBe("#spawn");

        const pushState = vi.spyOn(window.history, "pushState");
        urlManager.pushRoomIdToUrl(roomForPath("/play/~/maps/empty.wam"));
        expect(pushState).not.toHaveBeenCalled();
    });
});
