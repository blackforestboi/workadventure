import { afterEach, describe, expect, it, vi } from "vitest";

import type { Room } from "../../../src/front/Connection/Room";
import { urlManager } from "../../../src/front/Url/UrlManager";

const roomForPath = (path: string): Room =>
    ({
        id: path.replace(/^\//, ""),
        href: `http://play.workadventure.localhost${path}`,
        search: new URLSearchParams(),
    }) as unknown as Room;

describe("UrlManager", () => {
    afterEach(() => {
        vi.restoreAllMocks();
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
});
