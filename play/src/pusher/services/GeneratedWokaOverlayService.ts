import type { WokaList } from "@workadventure/messages";

import { TEAPOT_WOKA_CATEGORIES } from "../../common/Teapot/TeapotWoka";
import type { TeapotWokaService } from "../teapot/TeapotWokaService";
import type { WokaServiceInterface } from "./WokaServiceInterface";

const GENERATED_COLLECTION_NAME = "Generated";

export class GeneratedWokaOverlayService implements WokaServiceInterface {
    constructor(
        private readonly base: WokaServiceInterface,
        private readonly generatedWokas: TeapotWokaService,
    ) {}

    async getWokaList(roomUrl: string, providerSubject: string): Promise<WokaList | undefined> {
        const [baseList, generatedTextures] = await Promise.all([
            this.base.getWokaList(roomUrl, providerSubject),
            this.generatedWokas.listTexturesByCategory(providerSubject),
        ]);
        const merged: WokaList = { ...(baseList ?? {}) };
        for (const category of TEAPOT_WOKA_CATEGORIES) {
            const textures = generatedTextures[category];
            if (textures.length === 0) continue;
            const basePart = merged[category];
            const collections = (basePart?.collections ?? []).filter(
                (collection) => collection.name !== GENERATED_COLLECTION_NAME,
            );
            merged[category] = {
                ...(basePart ?? {}),
                collections: [...collections, { name: GENERATED_COLLECTION_NAME, textures }],
            };
        }
        return Object.keys(merged).length === 0 ? undefined : merged;
    }
}
