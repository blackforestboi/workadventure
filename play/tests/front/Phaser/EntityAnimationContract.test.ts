import { describe, expect, it } from "vitest";

import entitySource from "../../../src/front/Phaser/ECS/Entity.ts?raw";
import entitiesManagerSource from "../../../src/front/Phaser/Game/GameMap/EntitiesManager.ts?raw";
import texturesHelperSource from "../../../src/front/Phaser/Helpers/TexturesHelper.ts?raw";

describe("animated entity contract", () => {
    it("loads animated prefabs as sprites while keeping placement sizing independent", () => {
        expect(entitySource).toContain("class Entity extends Sprite");
        expect(entitySource).toContain("this.setDisplaySize(this.entityData.width, this.entityData.height)");
        expect(texturesHelperSource).toContain("scene.load.spritesheet");
        expect(texturesHelperSource).toContain("frameWidth: prefab.animation.frameWidth");
        expect(texturesHelperSource).toContain("repeat: -1");
        expect(entitiesManagerSource).toContain("TexturesHelper.playEntityAnimation(entity, prefab)");
    });
});
