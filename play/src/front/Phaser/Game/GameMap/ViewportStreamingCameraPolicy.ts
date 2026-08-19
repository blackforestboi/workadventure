import {
    DEFAULT_EXACT_VISIBLE_TILE_LIMIT,
    type TileViewport,
    type ViewportStreamingPlan,
} from "./ViewportStreamingBudget";

export interface PixelRectangle {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface PixelViewport {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
}

export interface TileDimensions {
    readonly width: number;
    readonly height: number;
}

/**
 * Derives a deterministic per-axis tile span from the exact-detail budget.
 * Camera policy applies the stricter screen axis when converting this span to
 * a zoom floor.
 */
export function getExactDetailTileSpan(exactVisibleTileLimit = DEFAULT_EXACT_VISIBLE_TILE_LIMIT): number {
    if (!Number.isSafeInteger(exactVisibleTileLimit) || exactVisibleTileLimit <= 0) {
        throw new Error("exactVisibleTileLimit must be a positive safe integer");
    }
    return Math.max(1, Math.floor(Math.sqrt(exactVisibleTileLimit)));
}

/**
 * Returns the largest clipped map extent the camera may reveal at exact
 * detail. Small maps retain their existing fit-to-map behavior; larger
 * dimensions are capped to the deterministic tile span.
 */
export function getZoomOutViewportPixelLimit(
    mapSize: { readonly width: number; readonly height: number },
    tileDimensions: TileDimensions,
    workspaceScale = 1,
    exactVisibleTileLimit = DEFAULT_EXACT_VISIBLE_TILE_LIMIT,
): { width: number; height: number } {
    assertPositiveFinite(mapSize.width, "mapSize.width");
    assertPositiveFinite(mapSize.height, "mapSize.height");
    assertPositiveFinite(tileDimensions.width, "tileDimensions.width");
    assertPositiveFinite(tileDimensions.height, "tileDimensions.height");
    assertPositiveFinite(workspaceScale, "workspaceScale");

    const tileSpan = getExactDetailTileSpan(exactVisibleTileLimit);
    return {
        width: Math.min(mapSize.width * workspaceScale, tileSpan * tileDimensions.width),
        height: Math.min(mapSize.height * workspaceScale, tileSpan * tileDimensions.height),
    };
}

/**
 * Converts the per-axis exact-detail span into a zoom-modifier floor. Axes
 * already smaller than the span are ignored because clipping to map bounds
 * keeps their exact tile count bounded and preserves small/slender map zoom.
 */
export function getExactDetailZoomModifierFloor(
    mapSize: { readonly width: number; readonly height: number },
    tileDimensions: TileDimensions,
    cameraViewport: { readonly width: number; readonly height: number },
    currentZoomModifier: number,
    currentCameraZoom: number,
    workspaceScale = 1,
    exactVisibleTileLimit = DEFAULT_EXACT_VISIBLE_TILE_LIMIT,
): number {
    assertPositiveFinite(currentZoomModifier, "currentZoomModifier");
    assertPositiveFinite(currentCameraZoom, "currentCameraZoom");
    assertPositiveFinite(workspaceScale, "workspaceScale");
    if (cameraViewport.width < 0 || cameraViewport.height < 0) {
        throw new Error("camera viewport dimensions must be non-negative");
    }

    const viewportLimit = getZoomOutViewportPixelLimit(mapSize, tileDimensions, workspaceScale, exactVisibleTileLimit);
    let minimumZoomModifier = 0;

    if (mapSize.width * workspaceScale > viewportLimit.width && cameraViewport.width > 0) {
        minimumZoomModifier = Math.max(
            minimumZoomModifier,
            (currentZoomModifier * cameraViewport.width) / viewportLimit.width / currentCameraZoom,
        );
    }
    if (mapSize.height * workspaceScale > viewportLimit.height && cameraViewport.height > 0) {
        minimumZoomModifier = Math.max(
            minimumZoomModifier,
            (currentZoomModifier * cameraViewport.height) / viewportLimit.height / currentCameraZoom,
        );
    }

    return minimumZoomModifier;
}

/** Converts a Phaser world-view rectangle to stable, integer tile bounds. */
export function worldViewToTileViewport(worldView: PixelRectangle, tileDimensions: TileDimensions): TileViewport {
    assertPositiveFinite(tileDimensions.width, "tileDimensions.width");
    assertPositiveFinite(tileDimensions.height, "tileDimensions.height");

    const left = Math.floor(worldView.x / tileDimensions.width);
    const top = Math.floor(worldView.y / tileDimensions.height);
    const right = Math.ceil((worldView.x + worldView.width) / tileDimensions.width);
    const bottom = Math.ceil((worldView.y + worldView.height) / tileDimensions.height);

    return {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
    };
}

export function worldBoundsToTileViewport(worldBounds: PixelRectangle, tileDimensions: TileDimensions): TileViewport {
    return worldViewToTileViewport(worldBounds, tileDimensions);
}

/**
 * Produces a bounded multiplayer-interest rectangle from the chunks selected
 * for full-detail residency. It is only a policy boundary; it does not imply
 * that chunk data has been loaded.
 */
export function getFullDetailResidentPixelViewport(
    plan: ViewportStreamingPlan,
    tileDimensions: TileDimensions,
    mapBounds: PixelRectangle,
): PixelViewport | null {
    if (plan.fullDetailChunks.length === 0) return null;

    const minChunkX = Math.min(...plan.fullDetailChunks.map(({ x }) => x));
    const minChunkY = Math.min(...plan.fullDetailChunks.map(({ y }) => y));
    const maxChunkX = Math.max(...plan.fullDetailChunks.map(({ x }) => x));
    const maxChunkY = Math.max(...plan.fullDetailChunks.map(({ y }) => y));
    const chunkPixelWidth = plan.chunkSize * tileDimensions.width;
    const chunkPixelHeight = plan.chunkSize * tileDimensions.height;

    const left = Math.max(mapBounds.x, minChunkX * chunkPixelWidth);
    const top = Math.max(mapBounds.y, minChunkY * chunkPixelHeight);
    const right = Math.min(mapBounds.x + mapBounds.width, (maxChunkX + 1) * chunkPixelWidth);
    const bottom = Math.min(mapBounds.y + mapBounds.height, (maxChunkY + 1) * chunkPixelHeight);

    return right > left && bottom > top ? { left, top, right, bottom } : null;
}

function assertPositiveFinite(value: number, name: string): void {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`);
}
