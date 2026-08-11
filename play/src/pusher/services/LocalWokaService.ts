import fs from "fs/promises";
import type { WokaDetail, WokaList } from "@workadventure/messages";
import { wokaPartNames } from "@workadventure/messages";
import type { TeapotWokaCategory } from "../../common/Teapot/TeapotWoka";
import type { TeapotWokaService } from "../teapot/TeapotWokaService";
import { isGeneratedWokaTextureId } from "../teapot/TeapotWokaService";
import type { WokaServiceInterface } from "./WokaServiceInterface";

export class LocalWokaService implements WokaServiceInterface {
    private generatedWokas: TeapotWokaService | undefined;

    setGeneratedWokaService(service: TeapotWokaService): void {
        this.generatedWokas = service;
    }

    private async loadWokaData(): Promise<WokaList> {
        try {
            const file = new URL("../data/woka.json", import.meta.url);
            const content = await fs.readFile(file, "utf8");
            return JSON.parse(content) as WokaList;
        } catch {
            throw new Error("Failed to load Woka data");
        }
    }

    /**
     * Returns the list of all available Wokas & Woka Parts for the current user.
     */
    async getWokaList(roomUrl: string, token: string): Promise<WokaList | undefined> {
        const wokaData: WokaList = await this.loadWokaData();
        if (!wokaData) {
            return undefined;
        }
        return wokaData;
    }

    /**
     * Returns the URL of all the images for the given texture ids.
     *
     * Key: texture id
     * Value: URL
     *
     * If one of the textures cannot be found, undefined is returned (and the user should be redirected to Woka choice page!)
     */
    async fetchWokaDetails(textureIds: string[], providerSubject?: string): Promise<WokaDetail[] | undefined> {
        const wokaData: WokaList = await this.loadWokaData();
        const textures = new Map<string, string>();
        const expectedCategories = expectedWokaCategories(textureIds.length);
        const generatedSelections = textureIds.flatMap((textureId, index) => {
            if (!isGeneratedWokaTextureId(textureId)) return [];
            const category = expectedCategories?.[index];
            return category === undefined ? [] : [{ textureId, category }];
        });
        const searchIds = new Set(textureIds.filter((textureId) => !isGeneratedWokaTextureId(textureId)));

        for (const part of wokaPartNames) {
            const wokaPartType = wokaData[part];
            if (!wokaPartType) {
                continue;
            }

            for (const collection of wokaPartType.collections) {
                for (const id of searchIds) {
                    const texture = collection.textures.find((texture) => texture.id === id);

                    if (texture) {
                        textures.set(id, texture.url);
                        searchIds.delete(id);
                    }
                }
            }
        }

        if (textureIds.some(isGeneratedWokaTextureId)) {
            if (
                this.generatedWokas === undefined ||
                providerSubject === undefined ||
                generatedSelections.length !== textureIds.filter(isGeneratedWokaTextureId).length
            ) {
                return undefined;
            }
            const generatedDetails = await this.generatedWokas.resolveGeneratedWokaDetails(
                providerSubject,
                generatedSelections.map((selection) => selection.textureId),
                generatedSelections.map((selection) => selection.category),
            );
            if (generatedDetails === undefined) return undefined;
            for (const detail of generatedDetails) textures.set(detail.id, detail.url);
        }

        if (textureIds.length !== textures.size) {
            return undefined;
        }

        const details: WokaDetail[] = [];
        for (const textureId of textureIds) {
            const url = textures.get(textureId);
            if (url === undefined) return undefined;
            details.push({ id: textureId, url });
        }

        return details;
    }
}

export const localWokaService = new LocalWokaService();

function expectedWokaCategories(textureCount: number): readonly TeapotWokaCategory[] | undefined {
    if (textureCount === 1) return ["woka"];
    if (textureCount === 6) return ["body", "eyes", "hair", "clothes", "hat", "accessory"];
    return undefined;
}
