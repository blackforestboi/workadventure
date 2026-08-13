import {
    DeleteVegetationPresetCommand,
    UpsertVegetationPresetCommand,
    vegetationPresetToMessage,
    type VegetationPreset,
    type WAMFileFormat,
} from "@workadventure/map-editor";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import type { FrontCommandInterface } from "../FrontCommandInterface";

export class UpsertVegetationPresetFrontCommand extends UpsertVegetationPresetCommand implements FrontCommandInterface {
    private readonly previousPreset: VegetationPreset | undefined;

    public constructor(
        private readonly wamFile: WAMFileFormat,
        preset: VegetationPreset,
        private readonly submittedRevision: number,
        commandId?: string,
        private readonly expectedMapRevision?: string,
    ) {
        const previousPreset = wamFile.vegetationPresets?.presets.find(({ id }) => id === preset.id);
        super(wamFile, preset, submittedRevision, commandId);
        this.previousPreset = previousPreset === undefined ? undefined : structuredClone(previousPreset);
    }

    public getUndoCommand(): DeleteVegetationPresetFrontCommand | UpsertVegetationPresetFrontCommand {
        if (this.previousPreset === undefined) {
            return new DeleteVegetationPresetFrontCommand(this.wamFile, this.preset.id, this.preset.revision);
        }
        return new UpsertVegetationPresetFrontCommand(this.wamFile, this.previousPreset, this.preset.revision);
    }

    public emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorUpsertVegetationPreset(
            this.commandId,
            vegetationPresetToMessage(this.preset),
            this.submittedRevision,
            this.expectedMapRevision,
        );
    }
}

export class DeleteVegetationPresetFrontCommand extends DeleteVegetationPresetCommand implements FrontCommandInterface {
    private readonly deletedPreset: VegetationPreset;

    public constructor(
        private readonly wamFile: WAMFileFormat,
        presetId: string,
        private readonly submittedRevision: number,
        commandId?: string,
        private readonly expectedMapRevision?: string,
    ) {
        const preset = wamFile.vegetationPresets?.presets.find(({ id }) => id === presetId);
        if (preset === undefined) throw new Error(`Vegetation preset ${presetId} does not exist`);
        super(wamFile, presetId, submittedRevision, commandId);
        this.deletedPreset = structuredClone(preset);
    }

    public getUndoCommand(): UpsertVegetationPresetFrontCommand {
        return new UpsertVegetationPresetFrontCommand(this.wamFile, this.deletedPreset, 0);
    }

    public emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorDeleteVegetationPreset(
            this.commandId,
            this.presetId,
            this.submittedRevision,
            this.expectedMapRevision,
        );
    }
}
