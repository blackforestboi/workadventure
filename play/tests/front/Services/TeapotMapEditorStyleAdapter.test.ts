import { describe, expect, it, vi } from "vitest";

import { MapStyleLocalStore, type MapStyleKeyValueStorage } from "../../../src/front/Services/MapStyleLocalStore";
import { TeapotMapEditorStyleAdapter } from "../../../src/front/Services/TeapotMapEditorStyleAdapter";
import { BUILT_IN_MAP_STYLE_ID, DEFAULT_MAP_STYLE_ID } from "../../../src/front/Stores/MapEditorStyleStore";

class MemoryStorage implements MapStyleKeyValueStorage {
    private value: string | null = null;
    getItem(): string | null {
        return this.value;
    }
    setItem(_key: string, value: string): void {
        this.value = value;
    }
}

const now = "2026-08-20T08:00:00.000Z";
const defaultStyle = {
    id: "server-default",
    name: "Default",
    isDefault: true,
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
};
const forestStyle = {
    id: "server-forest",
    name: "Forest",
    isDefault: false,
    isBuiltIn: false,
    createdAt: now,
    updatedAt: now,
};

function api() {
    return {
        list: vi.fn(() => Promise.resolve({ styles: [defaultStyle, forestStyle], entries: [] })),
        create: vi.fn((name: string) => Promise.resolve({ ...forestStyle, id: "server-created", name })),
        copy: vi.fn((styleId: string, source: unknown) =>
            Promise.resolve({
                id: "server-entry",
                styleId,
                assetKind: "tileset" as const,
                source: source as { type: "teapot-asset"; assetId: string; sourceVersion: 1 },
                metadataVersion: 1,
                metadata: { name: "Authoritative server name" },
                derivedFromAssetId: "asset-1",
                createdAt: now,
            }),
        ),
    };
}

function adapter(remote = api()) {
    return {
        remote,
        adapter: new TeapotMapEditorStyleAdapter({
            ownerScope: "user:owner-a",
            store: new MapStyleLocalStore(new MemoryStorage(), () => new Date(now)),
            api: remote,
            createId: () => "mutation-1",
        }),
    };
}

describe("TeapotMapEditorStyleAdapter", () => {
    it("maps the server Default to the stable UI identity and keeps Built-in virtual", async () => {
        const { adapter: subject, remote } = adapter();
        const styles = await subject.listStyles();

        expect(styles.map((style) => style.id)).toEqual([DEFAULT_MAP_STYLE_ID, "server-forest", BUILT_IN_MAP_STYLE_ID]);
        await expect(subject.createStyle("Ink")).resolves.toMatchObject({ id: "server-created", name: "Ink" });
        expect(remote.create).toHaveBeenCalledWith("Ink", "mutation-1");
    });

    it("persists Teapot asset membership remotely without sending rich UI metadata", async () => {
        const { adapter: subject, remote } = adapter();
        const metadata = {
            name: "Moss tiles",
            description: "A damp forest floor",
            tags: ["moss", "forest"],
            keywords: ["green", "ground"],
            previewUrl: "/local-preview.png",
            snapshot: { tileGrid: [[1, 2]], collision: { blocked: true } },
        };
        const entry = await subject.copyAsset({
            destinationStyleId: "server-forest",
            assetKind: "terrain",
            source: { type: "teapot-tileset", key: "asset-1", version: "teapot-tileset-v1" },
            metadata,
            derivedFromAssetId: "asset-1",
        });

        expect(remote.copy).toHaveBeenCalledWith(
            "server-forest",
            { type: "teapot-asset", assetId: "asset-1", sourceVersion: 1 },
            "mutation-1",
        );
        expect(JSON.stringify(remote.copy.mock.calls[0])).not.toContain("local-preview");
        expect(entry.metadata).toEqual(metadata);
        expect(subject.getNotice()).toBeUndefined();
    });

    it("keeps unresolved entity-prefab membership local with a visible sync notice", async () => {
        const { adapter: subject, remote } = adapter();
        const entry = await subject.copyAsset({
            destinationStyleId: "server-forest",
            assetKind: "object",
            source: { type: "entity-prefab", key: "tree-1", version: "entity-prefab-v1" },
            metadata: { name: "Oak", tags: ["tree"], keywords: ["forest"], snapshot: { collisionGrid: [[1]] } },
        });

        expect(entry.id).toMatch(/^local:/);
        expect(remote.copy).not.toHaveBeenCalled();
        expect(subject.getNotice()).toContain("saved in this browser only");
        await expect(subject.listEntries()).resolves.toContainEqual(entry);
    });
});
