import { describe, expect, it } from "vitest";

import elevationRendererSource from "../../../../../src/front/Phaser/Game/GameMap/ElevationRenderer.ts?raw";

describe("ElevationRenderer resident window", () => {
    it("remembers resident tile bounds and applies them to full and incremental chunk selection", () => {
        const renderSource = elevationRendererSource.match(
            /public render\(map:[\s\S]*?\n {4}\/\*\* Updates only meshes/,
        )?.[0];
        const incrementalRenderSource = elevationRendererSource.match(
            /public renderElevationUpdates\([\s\S]*?\n {4}public updateWorldObjects/,
        )?.[0];

        expect(elevationRendererSource).toContain("private residentTileBounds: ChunkTileBounds | undefined");
        expect(renderSource).toContain("this.residentTileBounds = cloneTileBounds(residentTileBounds)");
        expect(renderSource).toContain("this.residentTileBounds,");
        expect(incrementalRenderSource).toContain("residentTileBounds = this.residentTileBounds");
        expect(incrementalRenderSource).toContain(
            "if (!tileBoundsEqual(this.residentTileBounds, nextResidentTileBounds))",
        );
        expect(incrementalRenderSource).toContain("nextResidentTileBounds,");
    });
});
