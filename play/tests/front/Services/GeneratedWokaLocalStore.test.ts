import { beforeEach, describe, expect, it } from "vitest";

import {
    forgetGeneratedWoka,
    loadRememberedGeneratedWokas,
    rememberGeneratedWoka,
} from "../../../src/front/Services/GeneratedWokaLocalStore";
import type { TeapotWokaView } from "../../../src/front/Services/TeapotWokaApi";

const STORAGE_KEY = "teapot-generated-wokas-v1";

const generatedAvatar: TeapotWokaView = {
    id: "teapot-woka:generated-avatar-1",
    name: "Generated avatar",
    url: "/teapot/woka-assets/generated-avatar-1.png",
    category: "woka",
    active: true,
    createdAt: "2026-08-09T20:00:00.000Z",
};

describe("generated Woka browser persistence", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("stores the accepted avatar metadata and PNG for reuse", async () => {
        const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

        await rememberGeneratedWoka(generatedAvatar, png);

        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Array<{
            asset: TeapotWokaView;
            pngBase64: string;
        }>;
        expect(stored).toHaveLength(1);
        expect(stored[0]?.asset).toEqual(generatedAvatar);
        expect(stored[0]?.pngBase64).toBe("iVBORw==");
    });

    it("removes a deleted avatar from browser storage", async () => {
        await rememberGeneratedWoka(generatedAvatar, new Blob([new Uint8Array([1])]));

        forgetGeneratedWoka(generatedAvatar.id);

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([]);
    });

    it("restores the full PNG fallback after a server catalog restart", async () => {
        const png = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: "image/png" });
        await rememberGeneratedWoka(generatedAvatar, png);

        const restored = loadRememberedGeneratedWokas();
        expect(restored).toHaveLength(1);
        expect(restored[0]?.asset).toEqual(generatedAvatar);
        const restoredAvatar = restored[0];
        if (restoredAvatar === undefined) throw new Error("Expected the generated avatar to be restored");
        expect(new Uint8Array(await restoredAvatar.png.arrayBuffer())).toEqual(
            new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
        );
    });
});
