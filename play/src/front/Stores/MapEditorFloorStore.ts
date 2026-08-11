import type { TeapotTilePatch } from "@workadventure/map-editor";
import { writable } from "svelte/store";

import type { TerrainAutotileTiles } from "../../common/Teapot/TerrainAutotile";

export interface MapEditorFloorLayer {
    name: string;
    width: number;
    height: number;
}

export interface MapEditorFloorTileset {
    name: string;
    image: string;
    firstGid: number;
    columns: number;
    rows: number;
    tileCount: number;
    tileGids: readonly number[];
}

export interface MapEditorFloorTilesetAsset {
    id: string;
    name: string;
    url: string;
    width: number;
    height: number;
}

export interface MapEditorFloorState {
    mapUrl: string;
    layers: readonly MapEditorFloorLayer[];
    tilesets: readonly MapEditorFloorTileset[];
    minimumGid: number;
    maximumGid: number;
    status: "idle" | "saving" | "saved" | "failed";
    changedTiles: number;
    selectedLayer: string;
    selectedGid: number;
    toolMode: "tile" | "shape";
    selectedTerrainFamilyId?: string;
    hoveredTile?: { layer: string; x: number; y: number };
    error?: string;
}

export type MapEditorFloorAction =
    | { id: string; type: "preview"; patch: TeapotTilePatch }
    | { id: string; type: "select-brush"; layer: string; gid: number }
    | {
          id: string;
          type: "select-library-brush";
          layer: string;
          tileId: number;
          tileset: MapEditorFloorTilesetAsset;
      }
    | {
          id: string;
          type: "select-library-shape";
          layer: string;
          familyId: string;
          autotile: TerrainAutotileTiles;
          tileset: MapEditorFloorTilesetAsset;
      }
    | {
          id: string;
          type: "add-tileset";
          tileset: MapEditorFloorTilesetAsset;
      };

export type MapEditorFloorActionInput =
    | { type: "preview"; patch: TeapotTilePatch }
    | { type: "select-brush"; layer: string; gid: number }
    | {
          type: "select-library-brush";
          layer: string;
          tileId: number;
          tileset: MapEditorFloorTilesetAsset;
      }
    | {
          type: "select-library-shape";
          layer: string;
          familyId: string;
          autotile: TerrainAutotileTiles;
          tileset: MapEditorFloorTilesetAsset;
      }
    | { type: "add-tileset"; tileset: MapEditorFloorTilesetAsset };

export const mapEditorFloorStateStore = writable<MapEditorFloorState | undefined>(undefined);
export const mapEditorFloorActionStore = writable<MapEditorFloorAction | undefined>(undefined);

export function dispatchMapEditorFloorAction(action: MapEditorFloorActionInput): void {
    mapEditorFloorActionStore.set({ ...action, id: crypto.randomUUID() });
}
