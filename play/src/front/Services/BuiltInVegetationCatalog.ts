import type { EntityPrefab, VegetationPreset } from "@workadventure/map-editor";

export const BUILT_IN_VEGETATION_PRESETS: readonly Omit<VegetationPreset, "species">[] = [
    { version: 1, id: "forest", name: "Forest", revision: 1, density: 0.45, minimumSpacing: 1.5 },
    { version: 1, id: "grassland", name: "Grassland", revision: 1, density: 0.8, minimumSpacing: 0.5 },
];

export function vegetationPrefabs(prefabs: readonly EntityPrefab[]): EntityPrefab[] {
    return prefabs.filter((prefab) => prefab.vegetation !== undefined);
}

export function createStarterVegetationPreset(
    starterId: "forest" | "grassland",
    prefabs: readonly EntityPrefab[],
): VegetationPreset | undefined {
    const starter = BUILT_IN_VEGETATION_PRESETS.find(({ id }) => id === starterId);
    if (starter === undefined) return undefined;
    const eligible = vegetationPrefabs(prefabs).filter((prefab) =>
        starterId === "grassland" ? prefab.vegetation?.category === "grass" : prefab.vegetation?.category !== "grass",
    );
    if (eligible.length === 0) return undefined;
    return {
        ...starter,
        id: `${starter.id}-copy`,
        name: `${starter.name} copy`,
        species: eligible.map((prefab) => ({
            prefabRef: { collectionName: prefab.collectionName, id: prefab.id },
            weight: 1,
        })),
    };
}
