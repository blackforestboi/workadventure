import * as Phaser from "phaser";
import { CancelablePromise } from "cancelable-promise";
import type { SuperLoaderPlugin } from "../Services/SuperLoaderPlugin";
import { PlayerTexturesKey } from "./PlayerTextures";
import type { WokaTextureDescriptionInterface, PlayerTextures } from "./PlayerTextures";

import Texture = Phaser.Textures.Texture;
import LoaderPlugin = Phaser.Loader.LoaderPlugin;

export interface FrameConfig {
    frameWidth: number;
    frameHeight: number;
}

export function usesHighResolutionWokaFrames(frameWidth: number, frameHeight: number): boolean {
    return frameWidth > 32 || frameHeight > 32;
}

export function preserveHighResolutionWokaSampling(texture: Texture): void {
    const frame = texture.get(0);
    if (usesHighResolutionWokaFrames(frame.realWidth, frame.realHeight)) {
        texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
}

function frameConfig(url: string): FrameConfig {
    try {
        const parsed = new URL(url, globalThis.location?.origin ?? "http://localhost");
        const frameWidth = Number(parsed.searchParams.get("frameWidth"));
        const frameHeight = Number(parsed.searchParams.get("frameHeight"));
        if (
            Number.isSafeInteger(frameWidth) &&
            frameWidth > 0 &&
            Number.isSafeInteger(frameHeight) &&
            frameHeight > 0
        ) {
            return { frameWidth, frameHeight };
        }
    } catch {
        // Built-in relative texture URLs use the standard frame size.
    }
    return { frameWidth: 32, frameHeight: 32 };
}

export const loadAllLayers = (
    load: LoaderPlugin,
    playerTextures: PlayerTextures,
): WokaTextureDescriptionInterface[][] => {
    const returnArray: WokaTextureDescriptionInterface[][] = [];
    playerTextures.getLayers().forEach((layer) => {
        const layerArray: WokaTextureDescriptionInterface[] = [];
        Object.values(layer).forEach((textureDescriptor) => {
            layerArray.push(textureDescriptor);
            if (!textureDescriptor.url) {
                console.warn("Player resource has no URL", textureDescriptor);
                return;
            }
            load.spritesheet(textureDescriptor.id, textureDescriptor.url, frameConfig(textureDescriptor.url));
        });
        returnArray.push(layerArray);
    });
    return returnArray;
};
export const loadAllDefaultModels = (
    load: LoaderPlugin,
    playerTextures: PlayerTextures,
): WokaTextureDescriptionInterface[] => {
    const returnArray = Object.values(playerTextures.getTexturesResources(PlayerTexturesKey.Woka));
    returnArray.forEach((playerResource: WokaTextureDescriptionInterface) => {
        if (!playerResource.url) {
            console.warn("Player resource has no URL", playerResource);
            return;
        }
        load.spritesheet(playerResource.id, playerResource.url, frameConfig(playerResource.url));
    });
    return returnArray;
};

export const loadWokaTexture = (
    superLoaderPlugin: SuperLoaderPlugin,
    texture: WokaTextureDescriptionInterface,
): CancelablePromise<Texture> => {
    return superLoaderPlugin.spritesheet(texture.id, texture.url, frameConfig(texture.url));
};

export const lazyLoadPlayerCharacterTextures = (
    superLoaderPlugin: SuperLoaderPlugin,
    textures: WokaTextureDescriptionInterface[],
): CancelablePromise<string[]> => {
    const promisesList: CancelablePromise<Texture>[] = [];
    for (const texture of textures) {
        promisesList.push(superLoaderPlugin.spritesheet(texture.id, texture.url, frameConfig(texture.url)));
    }
    const returnPromise: CancelablePromise<Texture[]> = CancelablePromise.all(promisesList);

    return returnPromise.then(() =>
        textures.map((key) => {
            return key.id;
        }),
    );
};
