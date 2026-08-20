import { describe, expect, it } from "vitest";
import {
    BUILT_IN_MAP_STYLE_ID,
    DEFAULT_MAP_STYLE_ID,
    createLocalMapEditorStyleAdapter,
    entryMatchesSearch,
    getStyleIdsContainingSource,
    normalizeMapEditorStyleName,
} from "../../../src/front/Stores/MapEditorStyleStore";

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length() {
        return this.values.size;
    }
    clear() {
        this.values.clear();
    }
    getItem(key: string) {
        return this.values.get(key) ?? null;
    }
    key(index: number) {
        return [...this.values.keys()][index] ?? null;
    }
    removeItem(key: string) {
        this.values.delete(key);
    }
    setItem(key: string, value: string) {
        this.values.set(key, value);
    }
}

describe("MapEditorStyleStore", () => {
    it("always returns Default then Built-in and deterministically sorted custom styles", async () => {
        const adapter = createLocalMapEditorStyleAdapter(new MemoryStorage());
        await adapter.createStyle("  Water color  ");
        await adapter.createStyle("Blueprint");
        const styles = await adapter.listStyles();

        expect(styles.map(({ id }) => id).slice(0, 2)).toEqual([DEFAULT_MAP_STYLE_ID, BUILT_IN_MAP_STYLE_ID]);
        expect(styles.map(({ name }) => name)).toEqual(["Default style", "Built-in", "Blueprint", "Water color"]);
        expect(normalizeMapEditorStyleName("  Ink   wash ")).toBe("Ink wash");
    });

    it("rejects duplicate names case-insensitively and retains the authoritative style IDs", async () => {
        const adapter = createLocalMapEditorStyleAdapter(new MemoryStorage());
        const created = await adapter.createStyle("Ink wash");
        expect(created.id).not.toBe("");
        await expect(adapter.createStyle(" ink WASH ")).rejects.toThrow("already exists");
    });

    it("copies a metadata-complete object once and keeps every source search term findable", async () => {
        const adapter = createLocalMapEditorStyleAdapter(new MemoryStorage());
        const destination = await adapter.createStyle("Forest");
        const source = { type: "entity-prefab", key: "tree-1", version: "entity-prefab-v1" };
        const metadata = {
            name: "Old oak",
            description: "A broad ancient tree",
            tags: ["tree", "forest"],
            keywords: ["oak", "vegetation"],
            category: "plants",
            previewUrl: "/tree.png",
            snapshot: {
                prefabs: [{ id: "tree-1", collisionGrid: [[1]], wall: undefined, vegetation: { version: 1 } }],
            },
        };

        const first = await adapter.copyAsset({
            destinationStyleId: destination.id,
            assetKind: "object",
            source,
            metadata,
            derivedFromAssetId: "tree-1",
        });
        const repeated = await adapter.copyAsset({
            destinationStyleId: destination.id,
            assetKind: "object",
            source,
            metadata,
        });

        expect(repeated.id).toBe(first.id);
        expect(await adapter.listEntries()).toHaveLength(1);
        expect(first.metadata).toEqual(metadata);
        expect(entryMatchesSearch(first, "ancient oak vegetation plants")).toBe(true);
        expect(getStyleIdsContainingSource([first], "object", source)).toEqual([destination.id]);
    });
});
