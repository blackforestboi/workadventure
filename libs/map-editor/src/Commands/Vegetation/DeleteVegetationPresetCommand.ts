import type { VegetationPresetCollection as VegetationPresetCollectionType, WAMFileFormat } from "../../types";
import { VegetationPresetCollection } from "../../types";
import { Command } from "../Command";

export class DeleteVegetationPresetCommand extends Command {
    public constructor(
        private readonly wam: WAMFileFormat,
        public readonly presetId: string,
        private readonly expectedRevision: number,
        commandId?: string,
    ) {
        super(commandId);
    }

    public execute(): Promise<void> {
        const collection: VegetationPresetCollectionType = this.wam.vegetationPresets ?? {
            version: 1,
            presets: [],
        };
        const preset = collection.presets.find(({ id }) => id === this.presetId);
        if (!preset) throw new Error(`Vegetation preset ${this.presetId} does not exist`);
        if (preset.revision !== this.expectedRevision) {
            throw new Error(
                `Vegetation preset ${this.presetId} revision mismatch: expected ${this.expectedRevision}, current ${preset.revision}`,
            );
        }
        this.wam.vegetationPresets = VegetationPresetCollection.parse({
            version: 1,
            presets: collection.presets.filter(({ id }) => id !== this.presetId),
        });
        return Promise.resolve();
    }
}
