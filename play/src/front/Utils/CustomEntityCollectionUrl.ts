import {
    ENTITIES_FOLDER_PATH_NO_PREFIX,
    ENTITY_COLLECTION_FILE,
} from "@workadventure/map-editor/src/Constants/CustomEntityCollectionConstants";

export function getCustomEntityCollectionUrl(wamUrl: string, publicMapStoragePrefix?: string): string {
    const mapStoragePrefix = publicMapStoragePrefix?.replace(/\/+$/, "") ?? "";
    const path = `${mapStoragePrefix}/${ENTITIES_FOLDER_PATH_NO_PREFIX}/${ENTITY_COLLECTION_FILE}`;

    return new URL(path.startsWith("/") ? path : `/${path}`, wamUrl).toString();
}
