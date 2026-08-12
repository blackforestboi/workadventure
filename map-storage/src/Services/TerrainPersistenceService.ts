import { applyTeapotTerrainMutation, type WamFile } from "@workadventure/map-editor";
import type { ModifyTerrainMessage } from "@workadventure/messages";
import { ITiledMap } from "@workadventure/tiled-map-type-guard";

import { fileSystem } from "../fileSystem";
import { mapPathUsingDomainWithPrefix } from "./PathMapper";

export async function persistTerrainMutation(
    wamFile: WamFile,
    wamUrl: URL,
    message: ModifyTerrainMessage,
): Promise<void> {
    const configuredMapUrl = new URL(wamFile.getWam().mapUrl, wamUrl).toString();
    if (message.mapUrl !== configuredMapUrl) throw new Error("The terrain edit belongs to a different map");

    const mapUrl = new URL(configuredMapUrl);
    if (!mapUrl.pathname.endsWith(".tmj") || mapUrl.pathname.includes("..")) {
        throw new Error("Terrain editing requires a valid TMJ map");
    }
    const mapKey = mapPathUsingDomainWithPrefix(mapUrl.pathname, mapUrl.hostname);
    const source = ITiledMap.parse(JSON.parse(await fileSystem.readFileAsString(mapKey)));
    const updated = applyTeapotTerrainMutation(source, {
        mapId: configuredMapUrl,
        regions: message.regions,
        tilesetJson: message.tilesetJson || undefined,
        removeTileset: message.removeTileset,
        layerJson: message.layerJson || undefined,
        removeLayer: message.removeLayer,
        beforeLayer: message.beforeLayer || undefined,
        elevationUpdates: message.elevationUpdates,
    });
    await fileSystem.writeStringAsFile(mapKey, JSON.stringify(updated));
}
