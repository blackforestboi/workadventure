import type { EntityPrefab } from "@workadventure/map-editor";
import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";

import entityEditorPickerSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityEditorPicker.svelte?raw";
import entityImageSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityItem/EntityImage.svelte?raw";
import entityItemSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityItem/EntityItem.svelte?raw";
import entityVariantPositionPickerSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityItem/EntityVariantPositionPicker.svelte?raw";
import entityEditorToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";
import entityRelatedEditorToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts?raw";
import { TexturesHelper } from "../../../../src/front/Phaser/Helpers/TexturesHelper";

describe("entity placement preview initialization", () => {
    it("positions and layers a loaded preview before the first pointer movement", () => {
        expect(entityRelatedEditorToolSource).toMatch(
            /preview\.setDisplaySize\([\s\S]*?this\.onEntityPrefabPreviewReady\(pointer\);/,
        );
        expect(entityEditorToolSource).toMatch(
            /onEntityPrefabPreviewReady\(pointer: Pointer\): void \{\s*this\.updateEntityPrefabPreviewPosition\(pointer\);\s*this\.changePreviewTint\(\);\s*\}/,
        );
    });

    it("registers a decoded static thumbnail in Phaser without another asynchronous load", () => {
        const image = document.createElement("img");
        Object.defineProperty(image, "naturalWidth", { value: 32 });
        const addImage = vi.fn();
        const scene = {
            textures: {
                exists: vi.fn(() => false),
                addImage,
                addSpriteSheet: vi.fn(),
            },
        } as unknown as Phaser.Scene;
        const prefab = { imagePath: "/chair.png" } as EntityPrefab;

        TexturesHelper.cacheEntityTextureFromImage(scene, prefab, image);

        expect(addImage).toHaveBeenCalledWith(prefab.imagePath, image);
    });

    it("registers a decoded animated thumbnail with its sprite-sheet frames", () => {
        const image = document.createElement("img");
        Object.defineProperty(image, "naturalWidth", { value: 128 });
        const addSpriteSheet = vi.fn();
        const scene = {
            textures: {
                exists: vi.fn(() => false),
                addImage: vi.fn(),
                addSpriteSheet,
            },
        } as unknown as Phaser.Scene;
        const prefab = {
            imagePath: "/animated-chair.png",
            animation: { frameWidth: 32, frameHeight: 48, frameCount: 4, frameDurationMs: 120 },
        } as EntityPrefab;

        TexturesHelper.cacheEntityTextureFromImage(scene, prefab, image);

        expect(addSpriteSheet).toHaveBeenCalledWith(prefab.imagePath, image, {
            frameWidth: 32,
            frameHeight: 48,
        });
    });

    it("caches the loaded thumbnail before publishing the selected prefab", () => {
        expect(entityEditorPickerSource).toMatch(
            /TexturesHelper\.cacheEntityTextureFromImage\([\s\S]*?mapEditorSelectedEntityPrefabStore\.set/,
        );
        expect(entityItemSource).toContain("onselectentity?.(entityVariant, loadedImage)");
        expect(entityVariantPositionPickerSource).toContain("onPickItem(item, loadedImages.get(item.id))");
        expect(entityImageSource).toContain('crossorigin="anonymous"');
        expect(entityVariantPositionPickerSource).toContain("<EntityImage");
    });
});
