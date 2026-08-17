import { applyTeapotTerrainMutation, type WamFile } from "@workadventure/map-editor";
import type { ModifyTerrainMessage } from "@workadventure/messages";
import { ITiledMap } from "@workadventure/tiled-map-type-guard";

import { fileSystem } from "../fileSystem";
import { mapPathUsingDomainWithPrefix } from "./PathMapper";

export async function persistTerrainMutation(
    wamFile: WamFile,
    wamUrl: URL,
    message: ModifyTerrainMessage,
    commandId: string,
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
    const serialized = JSON.stringify(updated);
    await fileSystem.writeStringAsFile(mapKey, serialized);

    const stored = await fileSystem.readFileAsString(mapKey);
    if (stored !== serialized) {
        const expectedBytes = Buffer.byteLength(serialized, "utf8");
        const storedBytes = Buffer.byteLength(stored, "utf8");
        throw new Error(
            `Terrain command ${commandId} could not be confirmed in remote storage for ${mapKey} ` +
                `(expected ${expectedBytes} bytes, read ${storedBytes})`,
        );
    }
}
