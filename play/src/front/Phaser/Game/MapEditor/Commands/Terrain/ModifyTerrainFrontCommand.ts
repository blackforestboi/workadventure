import { Command, type TeapotTerrainMutation } from "@workadventure/map-editor";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import type { FloorEditorTool } from "../../Tools/FloorEditorTool";
import type { FrontCommandInterface } from "../FrontCommandInterface";

export class ModifyTerrainFrontCommand extends Command implements FrontCommandInterface {
    public static fromOptimisticPreview(
        floorEditor: FloorEditorTool,
        mutation: TeapotTerrainMutation,
        inverseMutation: TeapotTerrainMutation,
    ): ModifyTerrainFrontCommand {
        return new ModifyTerrainFrontCommand(floorEditor, mutation, inverseMutation, { skipInitialApply: true });
    }

    public constructor(
        private readonly floorEditor: FloorEditorTool,
        private readonly mutation: TeapotTerrainMutation,
        private readonly inverseMutation: TeapotTerrainMutation,
        options: { commandId?: string; skipInitialApply?: boolean } = {},
    ) {
        super(options.commandId);
        this.skipNextApply = options.skipInitialApply ?? false;
    }

    private skipNextApply: boolean;

    public execute(): Promise<void> {
        if (!this.floorEditor.canApplyTerrainMutation(this.mutation)) {
            if (this.skipNextApply) {
                this.skipNextApply = false;
                this.floorEditor.revertOptimisticTerrainMutation(this.inverseMutation);
            }
            return Promise.reject(new Error("A tile beneath an avatar cannot be deleted."));
        }
        if (this.skipNextApply) {
            this.skipNextApply = false;
            return Promise.resolve();
        }
        this.floorEditor.applyTerrainMutation(this.mutation);
        return Promise.resolve();
    }

    public getUndoCommand(): ModifyTerrainFrontCommand {
        return new ModifyTerrainFrontCommand(this.floorEditor, this.inverseMutation, this.mutation);
    }

    public emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorModifyTerrain(this.commandId, this.mutation);
    }

    public onAcknowledged(): void {
        this.floorEditor.acknowledgeTerrainMutation();
    }

    public onRejected(reason: string): void {
        this.floorEditor.rejectTerrainMutation(reason);
    }
}
