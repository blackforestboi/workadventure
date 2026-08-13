import type { EntityPrefab, WallPlacementOrientation } from "@workadventure/map-editor";
import { getWallProjectionRise } from "@workadventure/map-editor";
import type Phaser from "phaser";

type WallTexture = { key: string; sourceWidth: number; sourceHeight: number; rise: number };

function stableTextureSuffix(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) hash = (hash * 33) ^ value.charCodeAt(index);
    return (hash >>> 0).toString(36);
}

function getSourceSize(source: CanvasImageSource): { width: number; height: number } {
    const image = source as HTMLImageElement;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        return { width: image.naturalWidth, height: image.naturalHeight };
    }
    const canvas = source as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
}

/** Builds and caches a column-projected raster so wall posts stay vertical while its edges recede in depth. */
export function ensureWallTexture(
    scene: Phaser.Scene,
    prefab: EntityPrefab,
    orientation: WallPlacementOrientation,
): WallTexture {
    const sourceTexture = scene.textures.get(prefab.imagePath);
    const source = sourceTexture.getSourceImage() as CanvasImageSource;
    const { width: sourceWidth, height: sourceHeight } = getSourceSize(source);
    if (sourceWidth <= 0 || sourceHeight <= 0) {
        return { key: prefab.imagePath, sourceWidth: 0, sourceHeight: 0, rise: 0 };
    }
    if (orientation === "horizontal" || prefab.wall === undefined) {
        return { key: prefab.imagePath, sourceWidth, sourceHeight, rise: 0 };
    }

    const rise = getWallProjectionRise(sourceWidth, prefab.wall.projectionDepthTiles);
    const direction = orientation === "diagonal-up" ? "up" : "down";
    const key = `wall-projection:${stableTextureSuffix(`${prefab.imagePath}:${direction}:${rise}`)}`;
    if (!scene.textures.exists(key)) {
        const canvas = document.createElement("canvas");
        canvas.width = sourceWidth;
        canvas.height = sourceHeight + rise;
        const context = canvas.getContext("2d");
        if (context === null) return { key: prefab.imagePath, sourceWidth, sourceHeight, rise: 0 };
        context.imageSmoothingEnabled = false;
        for (let x = 0; x < sourceWidth; x += 1) {
            const progress = sourceWidth <= 1 ? 0 : x / (sourceWidth - 1);
            const offset = Math.round(direction === "up" ? rise * (1 - progress) : rise * progress);
            context.drawImage(source, x, 0, 1, sourceHeight, x, offset, 1, sourceHeight);
        }
        scene.textures.addCanvas(key, canvas);
    }
    return { key, sourceWidth, sourceHeight, rise };
}

export function applyWallTextureToEntity(
    scene: Phaser.Scene,
    entity: Phaser.GameObjects.Sprite,
    prefab: EntityPrefab,
    orientation: WallPlacementOrientation | undefined,
): void {
    if (orientation === undefined || prefab.wall === undefined) {
        entity.setTexture(prefab.imagePath);
        return;
    }
    entity.setTexture(ensureWallTexture(scene, prefab, orientation).key);
}

export function applyWallTextureToPreview(
    scene: Phaser.Scene,
    preview: Phaser.GameObjects.Sprite,
    prefab: EntityPrefab,
    orientation: WallPlacementOrientation,
): void {
    if (prefab.wall === undefined) {
        preview.setTexture(prefab.imagePath);
        return;
    }
    const previousKey = preview.texture.key;
    const wasProjected = previousKey.startsWith("wall-projection:");
    const baseDisplayWidth = preview.displayWidth;
    const baseDisplayHeight = wasProjected
        ? preview.displayHeight - baseDisplayWidth * prefab.wall.projectionDepthTiles
        : preview.displayHeight;
    const texture = ensureWallTexture(scene, prefab, orientation);
    preview.setTexture(texture.key);
    const projectedRise = orientation === "horizontal" ? 0 : baseDisplayWidth * prefab.wall.projectionDepthTiles;
    preview.setDisplaySize(baseDisplayWidth, baseDisplayHeight + projectedRise);
}
