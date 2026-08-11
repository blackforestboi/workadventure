import { Command, type TeapotTerrainMutation } from "@workadventure/map-editor";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import type { FloorEditorTool } from "../../Tools/FloorEditorTool";
import type { FrontCommandInterface } from "../FrontCommandInterface";

export class ModifyTerrainFrontCommand extends Command implements FrontCommandInterface {
    public constructor(
        private readonly floorEditor: FloorEditorTool,
        private readonly mutation: TeapotTerrainMutation,
        private readonly inverseMutation: TeapotTerrainMutation,
        commandId?: string,
    ) {
        super(commandId);
    }

    public execute(): Promise<void> {
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
