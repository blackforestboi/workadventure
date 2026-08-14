import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAuthToken = (payload: Record<string, unknown>): string => {
    const header = window.btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = window.btoa(JSON.stringify(payload));
    return `${header}.${body}.signature`;
};

describe("LocalUserStore", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("restores the logged-in state from a persisted X auth token after a reload", async () => {
        const token = createAuthToken({ identifier: "user-1", authProvider: "x" });
        localStorage.setItem("authToken", token);

        const { localUserStore } = await import("../../../src/front/Connection/LocalUserStore");

        expect(localUserStore.getAuthToken()).toBe(token);
        expect(localUserStore.isLogged()).toBe(true);
    });
});
