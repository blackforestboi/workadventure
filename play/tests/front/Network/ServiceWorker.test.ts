import { afterEach, describe, expect, it, vi } from "vitest";

import { clearDevelopmentServiceWorkersAndCaches } from "../../../src/front/Network/ServiceWorker";

describe("development service worker cleanup", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("removes stale development and production workers and WorkAdventure caches", async () => {
        const unregisterDevelopment = vi.fn().mockResolvedValue(true);
        const unregisterProduction = vi.fn().mockResolvedValue(true);
        const deleteCache = vi.fn().mockResolvedValue(true);

        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: {
                getRegistrations: vi
                    .fn()
                    .mockResolvedValue([{ unregister: unregisterDevelopment }, { unregister: unregisterProduction }]),
            },
        });
        vi.stubGlobal("caches", {
            keys: vi
                .fn()
                .mockResolvedValue(["workavdenture-cache", "workavdenture-cache-dev", "unrelated-application-cache"]),
            delete: deleteCache,
        });

        await clearDevelopmentServiceWorkersAndCaches();

        expect(unregisterDevelopment).toHaveBeenCalledOnce();
        expect(unregisterProduction).toHaveBeenCalledOnce();
        expect(deleteCache).toHaveBeenCalledTimes(2);
        expect(deleteCache).toHaveBeenCalledWith("workavdenture-cache");
        expect(deleteCache).toHaveBeenCalledWith("workavdenture-cache-dev");
        expect(deleteCache).not.toHaveBeenCalledWith("unrelated-application-cache");
    });
});
