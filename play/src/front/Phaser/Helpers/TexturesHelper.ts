import * as Phaser from "phaser";
import { asError } from "catch-unknown";
import {
    isVisualAssetAnimationStatic,
    toPhaserVisualAssetAnimationFrames,
    type EntityPrefab,
} from "@workadventure/map-editor";

import Sprite = Phaser.GameObjects.Sprite;

export class TexturesHelper {
    public static async getSnapshot(
        scene: Phaser.Scene,
        ...sprites: { sprite: Sprite; frame?: string | number }[]
    ): Promise<string> {
        if (!scene.game.renderer) {
            // In headless mode, we cannot take snapshots.
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            return "";
        }
        const rt = scene.make.renderTexture({}, false);
        try {
            for (const { sprite, frame } of sprites) {
                if (frame) {
                    sprite.setFrame(frame);
                }
                rt.draw(sprite, sprite.displayWidth * 0.5, sprite.displayHeight * 0.5);
            }
            rt.render();
            return new Promise<string>((resolve, reject) => {
                try {
                    rt.snapshot(
                        (url) => {
                            if (url instanceof HTMLImageElement) {
                                resolve(url.src);
                            } else {
                                console.error("Unexpected color object received for snapshot", url);
                                resolve("");
                            }
                            rt.destroy();
                        },
                        "image/png",
                        1,
                    );
                } catch (error) {
                    rt.destroy();
                    reject(asError(error));
                }
            });
        } catch (error) {
            rt.destroy();
            throw new Error("Could not get the snapshot", { cause: error });
        }
    }

    public static createRectangleTexture(
        scene: Phaser.Scene,
        textureKey: string,
        width: number,
        height: number,
        color: number,
    ): void {
        const rectangleTexture = scene.add.graphics().fillStyle(color, 1).fillRect(0, 0, width, height);
        rectangleTexture.generateTexture(textureKey, width, height);
        rectangleTexture.destroy();
    }

    public static createCircleTexture(
        scene: Phaser.Scene,
        textureKey: string,
        radius: number,
        color: number,
        outlineColor?: number,
        outlineThickness?: number,
    ): void {
        const circleTexture = scene.add.graphics().fillStyle(color, 1).fillCircle(radius, radius, radius);
        if (outlineColor) {
            circleTexture.lineStyle(outlineThickness ?? 1, outlineColor).strokeCircle(radius, radius, radius);
        }
        circleTexture.generateTexture(textureKey, radius * 2, radius * 2);
        circleTexture.destroy();
    }

    public static async loadEntityImage(scene: Phaser.Scene, key: string, url: string): Promise<void> {
        return this.loadEntityTexture(scene, { imagePath: key }, url);
    }

    public static async loadEntityTexture(
        scene: Phaser.Scene,
        prefab: Pick<EntityPrefab, "imagePath" | "animation">,
        url: string,
    ): Promise<void> {
        const key = prefab.imagePath;
        return new Promise<void>((resolve, reject) => {
            if (scene.textures.exists(key)) {
                resolve();
                return;
            }
            const animated = !isVisualAssetAnimationStatic(prefab.animation);
            const fileType = animated ? "spritesheet" : "image";
            scene.load.once(`filecomplete-${fileType}-${key}`, () => {
                resolve();
            });
            scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
                if (file.key === key) reject(new Error(`Could not load entity texture ${url}`));
            });
            if (animated && prefab.animation !== undefined) {
                scene.load.spritesheet(key, url, {
                    frameWidth: prefab.animation.frameWidth,
                    frameHeight: prefab.animation.frameHeight,
                });
            } else {
                scene.load.image(key, url);
            }
            scene.load.start();
        });
    }

    public static playEntityAnimation(sprite: Sprite, prefab: EntityPrefab): void {
        const animation = prefab.animation;
        if (isVisualAssetAnimationStatic(animation) || animation === undefined) {
            sprite.stop();
            sprite.setFrame(0);
            return;
        }
        if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            sprite.stop();
            sprite.setFrame(0);
            return;
        }
        const animationKey = `entity:${prefab.collectionName}:${prefab.id}`;
        if (!sprite.scene.anims.exists(animationKey)) {
            sprite.scene.anims.create({
                key: animationKey,
                frames: toPhaserVisualAssetAnimationFrames(animation, prefab.imagePath),
                repeat: -1,
            });
        }
        sprite.play(animationKey, true);
    }
}
