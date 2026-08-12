import type { AssetGenerationProviderId } from "../../../Services/AssetGeneration/AssetGenerationTypes";
import type { TERRAIN_SURFACE_GRID_SIZE, TerrainSurfaceCrop } from "./TerrainSurfaceAssetLayout";

export interface ApprovedTerrainSurfaceAsset {
    blob: Blob;
    crop: TerrainSurfaceCrop;
    gridColumns: typeof TERRAIN_SURFACE_GRID_SIZE;
    gridRows: typeof TERRAIN_SURFACE_GRID_SIZE;
    /** Derived from the approved native-resolution crop; never a required output resolution. */
    tilePixelSize: number;
    source: "generated" | "imported";
    providerId?: AssetGenerationProviderId;
    modelId?: string;
    prompt?: string;
}
