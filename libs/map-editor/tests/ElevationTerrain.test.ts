import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    applyElevationUpdates,
    createElevationSampler,
    getElevationAt,
    getElevationCells,
    getElevationCliffEdges,
    getElevationContours,
    getElevationRenderChunks,
    getElevationSurfaceBounds,
    getElevationSurfaceMesh,
    incrementElevation,
    ELEVATION_WORLD_LAYER,
    MAX_ELEVATION,
    sculptElevation,
    WIDE_ELEVATION_BRUSH_RADIUS,
    worldToElevatedTileCoordinates,
} from "../src/Authoring/ElevationTerrain";

function createMap(): ITiledMap {
    return {
        orientation: "orthogonal",
        infinite: true,
        width: 1,
        height: 1,
        tilewidth: 32,
        tileheight: 32,
        layers: [],
        tilesets: [],
    } as unknown as ITiledMap;
}

describe("elevation terrain", () => {
    it("collapses legacy layer-bound heights into one canonical world surface on the next sculpt", () => {
        const legacy = applyElevationUpdates(createMap(), [
            { layer: "brown", x: 2, y: 3, elevation: 2 },
            { layer: "yellow", x: 2, y: 3, elevation: 4 },
            { layer: "brown", x: 3, y: 3, elevation: 1 },
        ]);

        expect(getElevationAt(legacy, ELEVATION_WORLD_LAYER, 2, 3)).toBe(4);
        const updates = sculptElevation(legacy, ELEVATION_WORLD_LAYER, 2, 3);
        expect(updates).toContainEqual({ layer: ELEVATION_WORLD_LAYER, x: 2, y: 3, elevation: 5 });

        const migrated = applyElevationUpdates(legacy, updates);
        expect(getElevationCells(migrated).every((cell) => cell.layer === ELEVATION_WORLD_LAYER)).toBe(true);
        expect(getElevationAt(migrated, ELEVATION_WORLD_LAYER, 2, 3)).toBe(5);
        expect(getElevationAt(migrated, ELEVATION_WORLD_LAYER, 3, 3)).toBeGreaterThanOrEqual(1);
    });

    it("stores sparse signed cells immutably and removes cells lowered to zero", () => {
        const source = createMap();
        const raised = applyElevationUpdates(source, [
            { layer: "floor", x: -2, y: 4, elevation: 3 },
            { layer: "floor", x: 0, y: 0, elevation: 1 },
        ]);

        expect(getElevationCells(source)).toEqual([]);
        expect(getElevationCells(raised)).toEqual([
            { layer: "floor", x: 0, y: 0, elevation: 1 },
            { layer: "floor", x: -2, y: 4, elevation: 3 },
        ]);
        expect(getElevationAt(raised, "floor", -2, 4)).toBe(3);
        expect(
            getElevationCells(applyElevationUpdates(raised, [{ layer: "floor", x: -2, y: 4, elevation: 0 }])),
        ).toEqual([{ layer: "floor", x: 0, y: 0, elevation: 1 }]);
    });

    it("increments one half-tile step at a time and caps elevation at twenty", () => {
        const source = applyElevationUpdates(createMap(), [
            { layer: "floor", x: 1, y: 1, elevation: MAX_ELEVATION - 1 },
        ]);

        expect(incrementElevation(source, "floor", 1, 1)).toEqual({
            layer: "floor",
            x: 1,
            y: 1,
            elevation: MAX_ELEVATION,
        });
        const capped = applyElevationUpdates(source, [incrementElevation(source, "floor", 1, 1)!]);
        expect(incrementElevation(capped, "floor", 1, 1)).toBeUndefined();
    });

    it("maps a pointer on raised terrain back to the visible tile", () => {
        let raised = createMap();
        for (let step = 0; step < 4; step += 1) {
            raised = applyElevationUpdates(raised, sculptElevation(raised, ELEVATION_WORLD_LAYER, 2, 3));
        }

        expect(worldToElevatedTileCoordinates(raised, 80, 48)).toEqual({ x: 2, y: 3 });
        expect(worldToElevatedTileCoordinates(createMap(), 80, 48)).toEqual({ x: 2, y: 1 });
    });

    it("derives cliff faces only where a cell rises above its neighbor", () => {
        const map = applyElevationUpdates(createMap(), [
            { layer: "floor", x: 0, y: 0, elevation: 2 },
            { layer: "floor", x: 1, y: 0, elevation: 1 },
        ]);

        expect(getElevationCliffEdges(map, "floor")).toContainEqual({
            x: 0,
            y: 0,
            direction: "east",
            elevation: 2,
            neighborElevation: 1,
        });
        expect(getElevationCliffEdges(map, "floor")).not.toContainEqual({
            x: 1,
            y: 0,
            direction: "west",
            elevation: 1,
            neighborElevation: 2,
        });
    });

    it("builds a smooth hill while the same point is raised continuously", () => {
        let map = createMap();
        for (let step = 0; step < 4; step += 1) {
            map = applyElevationUpdates(map, sculptElevation(map, "floor", 0, 0));
        }

        expect(getElevationAt(map, "floor", 0, 0)).toBe(4);
        expect(getElevationAt(map, "floor", 1, 0)).toBe(3);
        expect(getElevationAt(map, "floor", 2, 2)).toBe(2);
        expect(getElevationAt(map, "floor", 3, -3)).toBe(1);
        expect(getElevationAt(map, "floor", 4, 0)).toBe(0);
        expect(getElevationCliffEdges(map, "floor").every((edge) => edge.elevation - edge.neighborElevation <= 1)).toBe(
            true,
        );
    });

    it("raises a broad plateau with Shift and blends its outer edge", () => {
        let map = createMap();
        for (let step = 0; step < 2; step += 1) {
            map = applyElevationUpdates(
                map,
                sculptElevation(map, "floor", 0, 0, { radius: WIDE_ELEVATION_BRUSH_RADIUS }),
            );
        }

        expect(getElevationAt(map, "floor", -2, -2)).toBe(2);
        expect(getElevationAt(map, "floor", 2, 2)).toBe(2);
        expect(getElevationAt(map, "floor", 3, 0)).toBe(1);
        expect(getElevationAt(map, "floor", 4, 0)).toBe(0);
    });

    it("lowers with the inverse brush and does nothing below ground level", () => {
        const hill = applyElevationUpdates(createMap(), [
            { layer: "floor", x: 0, y: 0, elevation: 2 },
            { layer: "floor", x: 1, y: 0, elevation: 1 },
        ]);
        const lowered = applyElevationUpdates(hill, sculptElevation(hill, "floor", 0, 0, { direction: -1 }));

        expect(getElevationAt(lowered, "floor", 0, 0)).toBe(1);
        expect(getElevationAt(lowered, "floor", 1, 0)).toBe(1);
        expect(sculptElevation(createMap(), "floor", 0, 0, { direction: -1 })).toEqual([]);
    });

    it("derives one connected curved contour for adjacent cells", () => {
        const map = applyElevationUpdates(createMap(), [
            { layer: "floor", x: 0, y: 0, elevation: 1 },
            { layer: "floor", x: 1, y: 0, elevation: 1 },
        ]);
        const contours = getElevationContours(map, "floor");

        expect(contours).toHaveLength(1);
        expect(contours[0].level).toBe(1);
        expect(contours[0].points.some((point) => !Number.isInteger(point.x) || !Number.isInteger(point.y))).toBe(true);
        expect(Math.min(...contours[0].points.map((point) => point.x))).toBe(0);
        expect(Math.max(...contours[0].points.map((point) => point.x))).toBe(2);
    });

    it("keeps diagonal islands separate and supports signed concave geometry", () => {
        const map = applyElevationUpdates(createMap(), [
            { layer: "floor", x: -2, y: -2, elevation: 1 },
            { layer: "floor", x: -1, y: -2, elevation: 1 },
            { layer: "floor", x: -2, y: -1, elevation: 1 },
            { layer: "floor", x: 0, y: 0, elevation: 1 },
        ]);
        const contours = getElevationContours(map, "floor");

        expect(contours).toHaveLength(2);
        expect(contours.some((contour) => contour.points.some((point) => point.x < 0 && point.y < 0))).toBe(true);
        expect(getElevationContours(map, "floor")).toEqual(contours);
    });

    it("emits nested contour bands through the maximum elevation", () => {
        const map = applyElevationUpdates(createMap(), [{ layer: "floor", x: 0, y: 0, elevation: MAX_ELEVATION }]);

        expect(getElevationContours(map, "floor").map((contour) => contour.level)).toEqual(
            Array.from({ length: MAX_ELEVATION }, (_, index) => index + 1),
        );
    });

    it("derives a continuous subdivided surface through canonical cell-center heights", () => {
        const map = applyElevationUpdates(createMap(), [
            { layer: "floor", x: 0, y: 0, elevation: 1 },
            { layer: "floor", x: 1, y: 0, elevation: 2 },
        ]);
        const mesh = getElevationSurfaceMesh(map, "floor", 4);
        const heightAt = (x: number, y: number) =>
            mesh.vertices.find((vertex) => vertex.x === x && vertex.y === y)?.elevation;

        expect(heightAt(0.5, 0.5)).toBe(1);
        expect(heightAt(1, 0.5)).toBeCloseTo(1.5);
        expect(heightAt(1.5, 0.5)).toBe(2);
        expect(heightAt(-0.5, 0.5)).toBe(0);
        expect(heightAt(2.5, 0.5)).toBe(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.indices.length % 3).toBe(0);
    });

    it("bounds the rendered surface to the sparse elevation field instead of the whole map", () => {
        const map = applyElevationUpdates(createMap(), [
            { layer: "floor", x: -2, y: 4, elevation: 1 },
            { layer: "floor", x: 3, y: 8, elevation: 2 },
        ]);

        expect(getElevationSurfaceBounds(map, "floor")).toEqual({
            minX: -2.5,
            minY: 3.5,
            maxX: 4.5,
            maxY: 9.5,
        });
        expect(getElevationSurfaceBounds(map, "bridge")).toBeUndefined();
    });

    it("partitions the complete map into contiguous texture- and index-safe render chunks", () => {
        const map = { ...createMap(), width: 130, height: 70, infinite: false };
        const chunks = getElevationRenderChunks(map, 4096);

        expect(chunks).toHaveLength(6);
        expect(chunks[0]).toEqual({ minX: 0, minY: 0, maxX: 63, maxY: 63 });
        expect(chunks.at(-1)).toEqual({ minX: 126, minY: 63, maxX: 130, maxY: 70 });
        expect(() => getElevationRenderChunks(map, 0)).toThrow(/texture size/);
    });

    it("samples one smooth world surface after collapsing overlapping legacy layers", () => {
        const map = applyElevationUpdates(createMap(), [
            { layer: "floor", x: 0, y: 0, elevation: 2 },
            { layer: "floor", x: 1, y: 0, elevation: 4 },
            { layer: "bridge", x: 0, y: 0, elevation: 3 },
        ]);
        const sample = createElevationSampler(map);

        expect(sample(0.5, 0.5)).toBe(3);
        expect(sample(1, 0.5)).toBeCloseTo(3.5);
        expect(sample(-0.5, 0.5)).toBe(0);
        expect(createElevationSampler(map, new Set(["floor"]))(0.5, 0.5)).toBe(2);
    });

    it("covers flat cells when the mesh replaces the source floor layer", () => {
        const map = applyElevationUpdates(createMap(), [{ layer: "floor", x: 0, y: 0, elevation: 2 }]);
        const mesh = getElevationSurfaceMesh(map, "floor", 2, { minX: 0, minY: 0, maxX: 3, maxY: 2 });

        expect(mesh.vertices.some((vertex) => vertex.x === 3 && vertex.y === 2 && vertex.elevation === 0)).toBe(true);
        expect(mesh.indices).toHaveLength(3 * 2 * 2 * 2 * 2 * 3);
    });

    it("creates deterministic signed-coordinate mesh geometry and rejects invalid resolution", () => {
        const map = applyElevationUpdates(createMap(), [{ layer: "floor", x: -2, y: -3, elevation: 3 }]);
        const mesh = getElevationSurfaceMesh(map, "floor", 2);

        expect(mesh.vertices.some((vertex) => vertex.x === -1.5 && vertex.y === -2.5 && vertex.elevation === 3)).toBe(
            true,
        );
        expect(getElevationSurfaceMesh(map, "floor", 2)).toEqual(mesh);
        expect(getElevationSurfaceMesh(createMap(), "floor")).toEqual({ vertices: [], indices: [] });
        expect(() => getElevationSurfaceMesh(map, "floor", 0)).toThrow(/subdivisions/);
    });
});
