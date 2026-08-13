import type { VegetationPlacementPlan, VegetationPreset } from "@workadventure/map-editor";
import { writable } from "svelte/store";

export type VegetationEditorStatus = "browsing" | "placing" | "selecting" | "planning" | "preview" | "saving";

export interface MapEditorVegetationState {
    status: VegetationEditorStatus;
    selectedPreset?: VegetationPreset;
    preview?: VegetationPlacementPlan;
    error?: string;
    selectionMode?: boolean;
}

export const mapEditorVegetationStore = writable<MapEditorVegetationState>({ status: "browsing" });

export function clearVegetationPreview(): void {
    mapEditorVegetationStore.update((state) => ({
        ...state,
        status: "browsing",
        preview: undefined,
        error: undefined,
        selectionMode: false,
    }));
}
