import * as Phaser from "phaser";
import { get } from "svelte/store";
import { TextField } from "../Components/TextField";
import { LL } from "../../../i18n/i18n-svelte";
import { gameManager } from "../Game/GameManager";
import { BRANDING } from "../../Branding";

import Image = Phaser.GameObjects.Image;

export const ReconnectingSceneName = "ReconnectingScene";
export enum ReconnectingTextures {
    icon = "icon",
    mainFont = "main_font",
}

export class ReconnectingScene extends Phaser.Scene {
    private reconnectingField!: TextField;
    private logo!: Image;

    constructor() {
        super({
            key: ReconnectingSceneName,
        });
    }

    preload() {
        this.load.image(ReconnectingTextures.icon, BRANDING.assets.statusIcon);
        // Note: arcade.png from the Phaser 3 examples at: https://github.com/photonstorm/phaser3-examples/tree/master/public/assets/fonts/bitmap
        this.load.bitmapFont(
            ReconnectingTextures.mainFont,
            BRANDING.assets.statusFontImage,
            BRANDING.assets.statusFontData,
        );
        this.load.spritesheet("cat", BRANDING.assets.statusCharacter, { frameWidth: 32, frameHeight: 32 });
    }

    create() {
        this.logo = new Image(
            this,
            this.game.renderer.width - 30,
            this.game.renderer.height - 30,
            ReconnectingTextures.icon,
        );
        this.logo.setDisplaySize(32, 32);
        this.add.existing(this.logo);

        this.reconnectingField = new TextField(
            this,
            this.game.renderer.width / 2,
            this.game.renderer.height / 2,
            get(LL).warning.connectionLost(),
        );

        const cat = this.add.sprite(this.game.renderer.width / 2, this.game.renderer.height / 2 - 32, "cat");
        if (!this.anims.exists("right")) {
            this.anims.create({
                key: "right",
                frames: this.anims.generateFrameNumbers("cat", { start: 6, end: 8 }),
                frameRate: 10,
                repeat: -1,
            });
        }
        cat.play("right");

        if (gameManager.currentStartedRoom.backgroundColor != undefined) {
            this.cameras.main.setBackgroundColor(gameManager.currentStartedRoom.backgroundColor);
        }
    }
}
