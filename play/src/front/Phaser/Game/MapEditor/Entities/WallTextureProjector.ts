import type { EntityPrefab, WallPlacementOrientation } from "@workadventure/map-editor";
import {
    getWallPlacementSize,
    getWallProjectionRise,
    getWallRenderSize,
    isDiagonalWallOrientation,
    WALL_EDGE_RENDER_WIDTH,
    WALL_TILE_SIZE,
} from "@workadventure/map-editor";
import type Phaser from "phaser";

type WallTexture = { key: string; sourceWidth: number; sourceHeight: number; rise: number };
type DiagonalWallOrientation = Extract<WallPlacementOrientation, "diagonal-up" | "diagonal-down">;

export type WallProjectionTransform = {
    scaleX: number;
    scaleY: number;
    shearY: number;
    offsetY: number;
};

export function getWallProjectionTransform(
    sourceWidth: number,
    sourceHeight: number,
    projectedWidth: number,
    projectedHeight: number,
    rise: number,
    orientation: DiagonalWallOrientation,
): WallProjectionTransform {
    const direction = orientation === "diagonal-up" ? -1 : 1;
    return {
        scaleX: projectedWidth / sourceWidth,
        scaleY: projectedHeight / sourceHeight,
        shearY: direction * (rise / sourceWidth),
        offsetY: orientation === "diagonal-up" ? rise : 0,
    };
}

/** Affine-shears the complete source image, then redraws its parallel diagonal borders as crisp pixel lines. */
export function drawDiagonalWallProjection(
    context: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    projectedWidth: number,
    projectedHeight: number,
    rise: number,
    orientation: DiagonalWallOrientation,
): void {
    const transform = getWallProjectionTransform(
        sourceWidth,
        sourceHeight,
        projectedWidth,
        projectedHeight,
        rise,
        orientation,
    );
    context.save();
    context.imageSmoothingEnabled = false;
    context.setTransform(transform.scaleX, transform.shearY, 0, transform.scaleY, 0, transform.offsetY);
    context.drawImage(source, 0, 0);
    context.restore();

    context.fillStyle = "#000000";
    for (let x = 0; x < projectedWidth; x += 1) {
        const progress = projectedWidth <= 1 ? 0 : x / (projectedWidth - 1);
        const topY = Math.round(orientation === "diagonal-up" ? rise * (1 - progress) : rise * progress);
        context.fillRect(x, topY, 1, 1);
        context.fillRect(x, topY + projectedHeight - 1, 1, 1);
    }
}

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

/** Builds and caches a full-raster diagonal projection with parallel sloped borders. */
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
    if (orientation === "vertical" && prefab.wall !== undefined) {
        const key = `wall-edge:${stableTextureSuffix(prefab.imagePath)}`;
        if (!scene.textures.exists(key)) {
            const canvas = document.createElement("canvas");
            canvas.width = WALL_EDGE_RENDER_WIDTH;
            canvas.height = sourceHeight;
            const context = canvas.getContext("2d");
            if (context === null) return { key: prefab.imagePath, sourceWidth, sourceHeight, rise: 0 };
            context.imageSmoothingEnabled = false;
            context.fillStyle = "#000000";
            context.fillRect(0, 0, WALL_EDGE_RENDER_WIDTH, sourceHeight);
            scene.textures.addCanvas(key, canvas);
        }
        return { key, sourceWidth: WALL_EDGE_RENDER_WIDTH, sourceHeight, rise: 0 };
    }
    if (!isDiagonalWallOrientation(orientation) || prefab.wall === undefined) {
        return { key: prefab.imagePath, sourceWidth, sourceHeight, rise: 0 };
    }

    const projectedWidth = WALL_TILE_SIZE;
    const projectedHeight =
        getWallPlacementSize(orientation, prefab.defaultSizeInTiles, prefab.defaultHeightInTiles).heightInTiles *
        WALL_TILE_SIZE;
    const rise = getWallProjectionRise(projectedWidth, prefab.wall.projectionDepthTiles);
    const diagonalOrientation: DiagonalWallOrientation =
        orientation === "diagonal-up" ? "diagonal-up" : "diagonal-down";
    const key = `wall-projection-v5:${stableTextureSuffix(
        `${prefab.imagePath}:${diagonalOrientation}:${projectedHeight}:${rise}`,
    )}`;
    if (!scene.textures.exists(key)) {
        const canvas = document.createElement("canvas");
        canvas.width = projectedWidth;
        canvas.height = projectedHeight + rise;
        const context = canvas.getContext("2d");
        if (context === null) return { key: prefab.imagePath, sourceWidth, sourceHeight, rise: 0 };
        drawDiagonalWallProjection(
            context,
            source,
            sourceWidth,
            sourceHeight,
            projectedWidth,
            projectedHeight,
            rise,
            diagonalOrientation,
        );
        scene.textures.addCanvas(key, canvas);
    }
    return { key, sourceWidth: projectedWidth, sourceHeight, rise };
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
    const wallSize = getWallRenderSize(orientation, prefab.defaultSizeInTiles, prefab.defaultHeightInTiles);
    entity.setDisplaySize(wallSize.width, wallSize.height);
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
    const texture = ensureWallTexture(scene, prefab, orientation);
    preview.setTexture(texture.key);
    const wallSize = getWallRenderSize(orientation, prefab.defaultSizeInTiles, prefab.defaultHeightInTiles);
    preview.setDisplaySize(wallSize.width, wallSize.height);
}
