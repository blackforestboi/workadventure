import type { EntityDimensions, WamFile, WAMEntityData } from "@workadventure/map-editor";
import { CreateEntityCommand } from "@workadventure/map-editor";
import type { EntitiesManager } from "../../../GameMap/EntitiesManager";
import type { FrontCommandInterface } from "../FrontCommandInterface";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import { normalizeEntityDimensions } from "../../../../../Utils/EntityPrefabSize";
import { DeleteEntityFrontCommand } from "./DeleteEntityFrontCommand";

export class CreateEntityFrontCommand extends CreateEntityCommand implements FrontCommandInterface {
    private readonly entityDimensions: EntityDimensions;

    constructor(
        wamFile: WamFile,
        entityId: string | undefined,
        entityData: WAMEntityData,
        commandId: string | undefined,
        private entitiesManager: EntitiesManager,
        entityDimensions: EntityDimensions,
    ) {
        const normalizedDimensions = normalizeEntityDimensions(entityDimensions);
        super(
            wamFile,
            entityId,
            {
                ...entityData,
                width: normalizedDimensions.width,
                height: normalizedDimensions.height,
            },
            commandId,
        );
        this.entityDimensions = normalizedDimensions;
    }

    public async execute(): Promise<void> {
        const returnVal = super.execute();
        await this.entitiesManager.addEntity(this.entityId, structuredClone(this.entityData), undefined, true);

        return returnVal;
    }

    public getUndoCommand(): DeleteEntityFrontCommand {
        return new DeleteEntityFrontCommand(this.wamFile, this.entityId, undefined, this.entitiesManager);
    }

    public emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorCreateEntity(this.commandId, this.entityId, this.entityData, this.entityDimensions);
    }
}
