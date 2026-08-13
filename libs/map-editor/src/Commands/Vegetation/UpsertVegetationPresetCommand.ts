import type {
    VegetationPreset,
    VegetationPresetCollection as VegetationPresetCollectionType,
    WAMFileFormat,
} from "../../types";
import { VegetationPreset as VegetationPresetSchema, VegetationPresetCollection } from "../../types";
import { Command } from "../Command";

export class UpsertVegetationPresetCommand extends Command {
    public readonly preset: VegetationPreset;

    public constructor(
        private readonly wam: WAMFileFormat,
        preset: VegetationPreset,
        private readonly expectedRevision: number,
        commandId?: string,
    ) {
        super(commandId);
        this.preset = structuredClone(preset);
    }

    public execute(): Promise<void> {
        const collection: VegetationPresetCollectionType = this.wam.vegetationPresets ?? {
            version: 1,
            presets: [],
        };
        const index = collection.presets.findIndex(({ id }) => id === this.preset.id);
        const currentRevision = index === -1 ? 0 : collection.presets[index].revision;
        if (currentRevision !== this.expectedRevision) {
            throw new Error(
                `Vegetation preset ${this.preset.id} revision mismatch: expected ${this.expectedRevision}, current ${currentRevision}`,
            );
        }
        const stored = VegetationPresetSchema.parse({ ...this.preset, revision: currentRevision + 1 });
        const presets = [...collection.presets];
        if (index === -1) presets.push(stored);
        else presets[index] = stored;
        this.wam.vegetationPresets = VegetationPresetCollection.parse({ version: 1, presets });
        this.preset.revision = stored.revision;
        return Promise.resolve();
    }
}
