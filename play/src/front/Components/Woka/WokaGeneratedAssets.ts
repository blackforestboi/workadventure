import type { TeapotWokaCategory } from "../../../common/Teapot/TeapotWoka";
import type { TeapotWokaView } from "../../Services/TeapotWokaApi";
import type { WokaData, WokaTexture } from "./WokaTypes";

export const GENERATED_WOKA_COLLECTION_NAME = "Generated";

export function addGeneratedWokaAsset(data: WokaData, asset: TeapotWokaView): WokaData {
    const layer = data[asset.category] ?? { collections: [] };
    const generatedTexture: WokaTexture = {
        id: asset.id,
        name: asset.name,
        url: asset.url,
        position: 0,
    };
    const existingGenerated = layer.collections.find(
        (collection) => collection.name === GENERATED_WOKA_COLLECTION_NAME,
    );
    const generatedTextures = [
        generatedTexture,
        ...(existingGenerated?.textures ?? []).filter((texture) => texture.id !== asset.id),
    ];
    const generatedCollection = {
        ...(existingGenerated ?? { position: layer.collections.length }),
        name: GENERATED_WOKA_COLLECTION_NAME,
        textures: generatedTextures,
    };
    return {
        ...data,
        [asset.category]: {
            ...layer,
            collections: [
                ...layer.collections.filter((collection) => collection.name !== GENERATED_WOKA_COLLECTION_NAME),
                generatedCollection,
            ],
        },
    };
}

export function removeGeneratedWokaAsset(data: WokaData, asset: TeapotWokaView): WokaData {
    const layer = data[asset.category];
    if (layer === undefined) return data;
    return {
        ...data,
        [asset.category]: {
            ...layer,
            collections: layer.collections
                .map((collection) =>
                    collection.name === GENERATED_WOKA_COLLECTION_NAME
                        ? { ...collection, textures: collection.textures.filter((texture) => texture.id !== asset.id) }
                        : collection,
                )
                .filter(
                    (collection) =>
                        collection.name !== GENERATED_WOKA_COLLECTION_NAME || collection.textures.length > 0,
                ),
        },
    };
}

export function findWokaTextureCollectionIndex(
    data: WokaData,
    category: TeapotWokaCategory,
    textureId: string,
): number {
    return (
        data[category]?.collections.findIndex((collection) =>
            collection.textures.some((texture) => texture.id === textureId),
        ) ?? -1
    );
}

export function generatedWokaName(category: TeapotWokaCategory, prompt: string): string {
    const categoryName = category === "woka" ? "Avatar" : category[0].toUpperCase() + category.slice(1);
    const description = prompt.trim().replace(/\s+/g, " ");
    return `${categoryName}: ${description || "Generated asset"}`.slice(0, 80);
}

export function isGeneratedWokaTexture(textureId: string): boolean {
    return textureId.startsWith("teapot-woka:");
}
