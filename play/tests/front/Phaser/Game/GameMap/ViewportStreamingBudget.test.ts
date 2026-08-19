import { describe, expect, it } from "vitest";

import {
    DEFAULT_VIEWPORT_CHUNK_SIZE,
    planViewportStreaming,
} from "../../../../../src/front/Phaser/Game/GameMap/ViewportStreamingBudget";

describe("planViewportStreaming", () => {
    it("maps an aligned viewport to one core chunk and a one-chunk halo", () => {
        const plan = planViewportStreaming({ x: 64, y: 128, width: 64, height: 64 }, 1);

        expect(plan.chunkSize).toBe(DEFAULT_VIEWPORT_CHUNK_SIZE);
        expect(plan.coreChunkCount).toBe(1);
        expect(plan.haloChunkCount).toBe(8);
        expect(plan.chunks.filter(({ residency }) => residency === "core")).toEqual([
            { x: 1, y: 2, key: "1:2", residency: "core" },
        ]);
        expect(plan.chunks.filter(({ residency }) => residency === "halo")).toHaveLength(8);
        expect(plan.fullDetailChunks).toHaveLength(9);
        expect(plan.detailLevel).toBe("exact");
    });

    it("uses floor division for centered worlds with negative tile coordinates", () => {
        const plan = planViewportStreaming({ x: -65, y: -1, width: 66, height: 2 }, 1, { haloChunks: 0 });

        expect(plan.chunks).toEqual([
            { x: -2, y: -1, key: "-2:-1", residency: "core" },
            { x: -1, y: -1, key: "-1:-1", residency: "core" },
            { x: 0, y: -1, key: "0:-1", residency: "core" },
            { x: -2, y: 0, key: "-2:0", residency: "core" },
            { x: -1, y: 0, key: "-1:0", residency: "core" },
            { x: 0, y: 0, key: "0:0", residency: "core" },
        ]);
    });

    it("clips core and halo chunks to a 4000 by 4000 world", () => {
        const plan = planViewportStreaming({ x: 3968, y: 3968, width: 64, height: 64 }, 1, {
            worldBounds: { x: 0, y: 0, width: 4000, height: 4000 },
        });

        expect(plan.visibleTileCount).toBe(32 * 32);
        expect(plan.chunks).toEqual([
            { x: 62, y: 62, key: "62:62", residency: "core" },
            { x: 61, y: 61, key: "61:61", residency: "halo" },
            { x: 62, y: 61, key: "62:61", residency: "halo" },
            { x: 61, y: 62, key: "61:62", residency: "halo" },
        ]);
    });

    it("keeps a complete 4000 by 4000 viewport within the default exact-detail residency budget", () => {
        const plan = planViewportStreaming({ x: 0, y: 0, width: 4000, height: 4000 }, 0.01, { haloChunks: 0 });

        expect(plan.visibleTileCount).toBe(16_000_000);
        expect(plan.coreChunkCount).toBe(63 * 63);
        expect(plan.fullDetailChunks).toHaveLength(25);
        expect(plan.deferredCoreChunkCount).toBe(63 * 63 - 25);
        expect(plan.detailLevel).toBe("region-summary");
    });

    it("prioritizes core chunks center-first and never exceeds either full-detail budget", () => {
        const plan = planViewportStreaming({ x: 0, y: 0, width: 192, height: 64 }, 1, {
            haloChunks: 1,
            maxFullDetailChunks: 10,
            maxFullDetailTiles: 2 * 64 * 64,
        });

        expect(plan.fullDetailChunkCapacity).toBe(2);
        expect(plan.fullDetailChunks).toEqual([
            { x: 1, y: 0, key: "1:0", residency: "core" },
            { x: 0, y: 0, key: "0:0", residency: "core" },
        ]);
        expect(plan.deferredCoreChunkCount).toBe(1);
        expect(plan.detailLevel).toBe("chunk-preview");
    });

    it("loads halo chunks only after every core chunk fits", () => {
        const plan = planViewportStreaming({ x: 0, y: 0, width: 128, height: 64 }, 1, {
            maxFullDetailChunks: 3,
            maxFullDetailTiles: 3 * 64 * 64,
        });

        expect(plan.fullDetailChunks.map(({ residency }) => residency)).toEqual(["core", "core", "halo"]);
    });

    it.each([
        {
            name: "exact for a bounded close viewport",
            viewport: { x: 0, y: 0, width: 64, height: 64 },
            zoom: 1,
            expected: "exact",
        },
        {
            name: "chunk preview when the visible tile limit is exceeded",
            viewport: { x: 0, y: 0, width: 256, height: 128 },
            zoom: 1,
            expected: "chunk-preview",
        },
        {
            name: "chunk preview when zoom is below the exact threshold",
            viewport: { x: 0, y: 0, width: 64, height: 64 },
            zoom: 0.25,
            expected: "chunk-preview",
        },
        {
            name: "region summary when zoom is below the preview threshold",
            viewport: { x: 0, y: 0, width: 64, height: 64 },
            zoom: 0.1,
            expected: "region-summary",
        },
        {
            name: "region summary when the preview tile limit is exceeded",
            viewport: { x: 0, y: 0, width: 1025, height: 1025 },
            zoom: 1,
            expected: "region-summary",
        },
    ])("selects $name", ({ viewport, zoom, expected }) => {
        const plan = planViewportStreaming(viewport, zoom, {
            exactVisibleTileLimit: 16_384,
            chunkPreviewVisibleTileLimit: 1_048_576,
            maxFullDetailChunks: 1_000,
            maxFullDetailTiles: 1_000 * 64 * 64,
        });

        expect(plan.detailLevel).toBe(expected);
    });

    it("returns no chunks for a viewport outside the world", () => {
        const plan = planViewportStreaming({ x: 5000, y: 5000, width: 64, height: 64 }, 1, {
            worldBounds: { x: 0, y: 0, width: 4000, height: 4000 },
        });

        expect(plan.visibleTileCount).toBe(0);
        expect(plan.chunks).toEqual([]);
        expect(plan.fullDetailChunks).toEqual([]);
        expect(plan.detailLevel).toBe("exact");
    });

    it("rejects invalid budget configurations", () => {
        expect(() => planViewportStreaming({ x: 0, y: 0, width: 1, height: 1 }, 1, { chunkSize: 0 })).toThrow(
            "chunkSize must be a positive integer",
        );
        expect(() =>
            planViewportStreaming({ x: 0, y: 0, width: 1, height: 1 }, 1, {
                exactVisibleTileLimit: 2,
                chunkPreviewVisibleTileLimit: 1,
            }),
        ).toThrow("chunkPreviewVisibleTileLimit must be greater than or equal to exactVisibleTileLimit");
    });
});
