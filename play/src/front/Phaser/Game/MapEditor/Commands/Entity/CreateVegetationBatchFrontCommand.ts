import {
    CreateVegetationBatchCommand,
    DeleteVegetationBatchCommand,
    vegetationPlacementPlanToMessage,
    type VegetationPlacementPlan,
    type WamFile,
} from "@workadventure/map-editor";
import type { EntitiesManager } from "../../../GameMap/EntitiesManager";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import { mapEditorVegetationStore } from "../../../../../Stores/MapEditorVegetationStore";
import type { FrontCommandInterface } from "../FrontCommandInterface";

export class CreateVegetationBatchFrontCommand extends CreateVegetationBatchCommand implements FrontCommandInterface {
    public constructor(
        wamFile: WamFile,
        plan: VegetationPlacementPlan,
        commandId: string | undefined,
        private readonly entitiesManager: EntitiesManager,
        private readonly expectedMapRevision?: string,
    ) {
        super(wamFile, plan, commandId);
    }

    public async execute(): Promise<void> {
        await super.execute();
        await Promise.all(
            this.plan.placements.map((placement) =>
                this.entitiesManager.addEntity(
                    placement.id,
                    {
                        prefabRef: placement.prefabRef,
                        x: placement.x,
                        y: placement.y,
                        width: placement.width,
                        height: placement.height,
                    },
                    undefined,
                    true,
                ),
            ),
        );
    }

    public getUndoCommand(): DeleteVegetationBatchFrontCommand {
        return new DeleteVegetationBatchFrontCommand(this.wamFile, this.plan, undefined, this.entitiesManager);
    }

    public emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorCreateVegetationBatch(
            this.commandId,
            vegetationPlacementPlanToMessage(this.plan),
            this.expectedMapRevision,
        );
    }

    public onAcknowledged(): void {
        mapEditorVegetationStore.update((state) => ({
            ...state,
            status: "selecting",
            preview: undefined,
            selectionMode: state.selectedPreset !== undefined,
        }));
    }

    public onRejected(reason: string): void {
        mapEditorVegetationStore.update((state) => ({
            ...state,
            status: "selecting",
            preview: undefined,
            selectionMode: state.selectedPreset !== undefined,
            error: reason.trim() || "The vegetation fill was rejected.",
        }));
    }
}

export class DeleteVegetationBatchFrontCommand extends DeleteVegetationBatchCommand implements FrontCommandInterface {
    public constructor(
        wamFile: WamFile,
        private readonly sourcePlan: VegetationPlacementPlan,
        commandId: string | undefined,
        private readonly entitiesManager: EntitiesManager,
        private readonly expectedMapRevision?: string,
    ) {
        super(
            wamFile,
            sourcePlan.placements.map(({ id }) => id),
            commandId,
        );
    }

    public async execute(): Promise<void> {
        await super.execute();
        for (const id of this.entityIds) this.entitiesManager.deleteEntity(id);
    }

    public getUndoCommand(): CreateVegetationBatchFrontCommand {
        return new CreateVegetationBatchFrontCommand(this.wamFile, this.sourcePlan, undefined, this.entitiesManager);
    }

    public emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorDeleteVegetationBatch(
            this.commandId,
            [...this.entityIds],
            this.expectedMapRevision,
        );
    }
}
