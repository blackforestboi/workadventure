import type { VegetationPlacementPlanMessage, VegetationPresetMessage } from "@workadventure/messages";
import { VegetationPlacementPlan, VegetationPreset } from "../types";
import type {
    VegetationPlacementPlan as VegetationPlacementPlanType,
    VegetationPreset as VegetationPresetType,
} from "../types";

export function vegetationPresetFromMessage(message: VegetationPresetMessage): VegetationPresetType {
    return VegetationPreset.parse({
        version: message.version,
        id: message.id,
        name: message.name,
        revision: message.revision,
        density: message.density,
        minimumSpacing: message.minimumSpacing,
        species: message.species.map((entry: VegetationPresetMessage["species"][number]) => ({
            prefabRef: {
                collectionName: requirePrefabRef(entry.prefabRef).collectionName,
                id: requirePrefabRef(entry.prefabRef).prefabId,
            },
            weight: entry.weight,
        })),
    });
}

export function vegetationPresetToMessage(preset: VegetationPresetType): VegetationPresetMessage {
    return {
        version: preset.version,
        id: preset.id,
        name: preset.name,
        revision: preset.revision,
        density: preset.density,
        minimumSpacing: preset.minimumSpacing,
        species: preset.species.map((entry) => ({
            prefabRef: { collectionName: entry.prefabRef.collectionName, prefabId: entry.prefabRef.id },
            weight: entry.weight,
        })),
    };
}

export function vegetationPlacementPlanFromMessage(
    message: VegetationPlacementPlanMessage,
): VegetationPlacementPlanType {
    if (!message.rectangle) throw new Error("Vegetation batch is missing its rectangle");
    return VegetationPlacementPlan.parse({
        version: message.version,
        presetId: message.presetId,
        presetRevision: message.presetRevision,
        seed: message.seed,
        rectangle: message.rectangle,
        placements: message.placements.map((placement: VegetationPlacementPlanMessage["placements"][number]) => ({
            id: placement.id,
            prefabRef: {
                collectionName: requirePrefabRef(placement.prefabRef).collectionName,
                id: requirePrefabRef(placement.prefabRef).prefabId,
            },
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height,
        })),
        skipped: message.skipped,
        digest: message.digest,
    });
}

export function vegetationPlacementPlanToMessage(plan: VegetationPlacementPlanType): VegetationPlacementPlanMessage {
    return {
        version: plan.version,
        presetId: plan.presetId,
        presetRevision: plan.presetRevision,
        seed: plan.seed,
        rectangle: plan.rectangle,
        placements: plan.placements.map((placement) => ({
            id: placement.id,
            prefabRef: { collectionName: placement.prefabRef.collectionName, prefabId: placement.prefabRef.id },
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height,
        })),
        skipped: plan.skipped,
        digest: plan.digest,
    };
}

function requirePrefabRef(reference: { collectionName: string; prefabId: string } | undefined) {
    if (!reference) throw new Error("Vegetation record is missing its prefab reference");
    return reference;
}
