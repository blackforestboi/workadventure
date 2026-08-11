const OCCLUDED_ASSET_ALPHA = 0.6;

export interface RectangleLike {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LocalOcclusionObject {
    alpha: number;
    depth: number;
    active?: boolean;
    getBounds(): RectangleLike;
    setAlpha(alpha: number): unknown;
}

function rectanglesOverlap(left: RectangleLike, right: RectangleLike): boolean {
    return (
        left.x < right.x + right.width &&
        left.x + left.width > right.x &&
        left.y < right.y + right.height &&
        left.y + left.height > right.y
    );
}

/**
 * Applies a purely local visibility aid when a placed asset covers the current player.
 * No state from this controller is sent to the room connection.
 */
export class LocalPlayerAssetOcclusion {
    private readonly originalAlphaByAsset = new Map<LocalOcclusionObject, number>();

    public update(
        localPlayerDepth: number,
        localPlayerBounds: RectangleLike,
        assets: Iterable<LocalOcclusionObject>,
    ): boolean {
        const currentAssets = new Set<LocalOcclusionObject>();
        let changed = false;

        for (const asset of assets) {
            currentAssets.add(asset);

            const shouldFade =
                asset.active !== false &&
                asset.depth > localPlayerDepth &&
                rectanglesOverlap(localPlayerBounds, asset.getBounds());
            const originalAlpha = this.originalAlphaByAsset.get(asset);

            if (shouldFade) {
                const alphaToRestore = originalAlpha ?? asset.alpha;
                if (originalAlpha === undefined) {
                    this.originalAlphaByAsset.set(asset, alphaToRestore);
                }

                const fadedAlpha = Math.min(alphaToRestore, OCCLUDED_ASSET_ALPHA);
                if (asset.alpha !== fadedAlpha) {
                    asset.setAlpha(fadedAlpha);
                    changed = true;
                }
            } else if (originalAlpha !== undefined) {
                if (asset.active !== false && asset.alpha !== originalAlpha) {
                    asset.setAlpha(originalAlpha);
                    changed = true;
                }
                this.originalAlphaByAsset.delete(asset);
            }
        }

        for (const [asset, originalAlpha] of this.originalAlphaByAsset) {
            if (currentAssets.has(asset)) {
                continue;
            }
            if (asset.active !== false && asset.alpha !== originalAlpha) {
                asset.setAlpha(originalAlpha);
                changed = true;
            }
            this.originalAlphaByAsset.delete(asset);
        }

        return changed;
    }
}
