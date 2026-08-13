import {
    EntityCollectionRaw,
    isBuiltInEntityPrefabReference,
    type VegetationPresetSpecies,
    type WamFile,
} from "@workadventure/map-editor";
import { entitiesFileMigration } from "@workadventure/map-editor/src/Migrations/EntitiesFileMigration";
import { fileSystem } from "../fileSystem";
import { mapPathUsingDomainWithPrefix } from "./PathMapper";

export async function assertVegetationPrefabReferences(
    wamFile: WamFile,
    wamUrl: URL,
    references: readonly VegetationPresetSpecies["prefabRef"][],
): Promise<void> {
    const available = new Set<string>();
    const collectionPromises = wamFile.getWam().entityCollections.map(async (descriptor) => {
        const url = new URL(descriptor.url, wamUrl);
        if (url.hostname !== wamUrl.hostname) {
            return undefined;
        }
        const path = mapPathUsingDomainWithPrefix(url.pathname, url.hostname);
        const raw = entitiesFileMigration.migrate(JSON.parse(await fileSystem.readFileAsString(path)));
        return EntityCollectionRaw.parse(raw);
    });
    for (const collection of await Promise.all(collectionPromises)) {
        if (collection === undefined) continue;
        for (const prefab of collection.collection) available.add(`${collection.collectionName}\0${prefab.id}`);
    }
    for (const reference of references) {
        if (isBuiltInEntityPrefabReference(reference)) continue;
        if (!available.has(`${reference.collectionName}\0${reference.id}`)) {
            throw new Error(`Vegetation prefab ${reference.collectionName}/${reference.id} does not exist`);
        }
    }
}
