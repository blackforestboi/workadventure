export interface TileLayerRenderPosition {
    x: number;
    y: number;
}

export interface TileLayerRenderPlacement {
    layer: TileLayerRenderPosition;
    parent?: TileLayerRenderPosition;
}

/**
 * Phaser's GPU tilemap submitter applies a layer's own x/y position twice.
 * Keep the GPU layer in its zero-based local coordinate space and put its
 * signed world origin on a parent container, whose transform is applied once.
 */
export function getTileLayerRenderPlacement(
    worldOrigin: TileLayerRenderPosition,
    gpu: boolean,
): TileLayerRenderPlacement {
    return gpu ? { layer: { x: 0, y: 0 }, parent: worldOrigin } : { layer: worldOrigin };
}

export function resolveTileLayerWorldOrigin(placement: TileLayerRenderPlacement): TileLayerRenderPosition {
    return {
        x: placement.layer.x + (placement.parent?.x ?? 0),
        y: placement.layer.y + (placement.parent?.y ?? 0),
    };
}
