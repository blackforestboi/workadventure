import type { WamFile, WAMEntityData, WAMFileFormat } from "@workadventure/map-editor";
import { UpdateEntityCommand } from "@workadventure/map-editor";
import type { EntitiesManager } from "../../../GameMap/EntitiesManager";
import type { GameScene } from "../../../GameScene";
import type { FrontCommandInterface } from "../FrontCommandInterface";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";

export class UpdateEntityFrontCommand extends UpdateEntityCommand implements FrontCommandInterface {
    constructor(
        wamFile: WamFile,
        entityId: string,
        dataToModify: Partial<WAMEntityData>,
        commandId: string | undefined,
        oldConfig: Partial<WAMEntityData> | undefined,
        private entitiesManager: EntitiesManager,
        private scene: GameScene,
    ) {
        super(wamFile, entityId, dataToModify, commandId, oldConfig);
    }

    public execute(): Promise<WAMFileFormat | undefined> {
        const returnVal = super.execute();
        this.handleEntityUpdate(this.newConfig);

        return returnVal;
    }

    public getUndoCommand(): UpdateEntityFrontCommand {
        return new UpdateEntityFrontCommand(
            this.wamFile,
            this.entityId,
            this.oldConfig,
            undefined,
            this.newConfig,
            this.entitiesManager,
            this.scene,
        );
    }

    public emitEvent(roomConnection: RoomConnection): void {
        const entity = this.entitiesManager.getEntities().get(this.entityId);
        if (!entity) {
            console.error("Entity not found");
            return;
        }
        roomConnection.emitMapEditorModifyEntity(
            this.commandId,
            this.entityId,
            {
                x: entity.x,
                y: entity.y,
                ...this.newConfig,
            },
            {
                width: entity.displayWidth,
                height: entity.displayHeight,
            },
        );
    }

    private handleEntityUpdate(config: Partial<WAMEntityData>): void {
        const entity = this.entitiesManager.getEntities().get(this.entityId);
        if (!entity) {
            return;
        }
        entity?.updateEntity(config);
        // If the entity is activable, and not in the activatable entities array of the entity manager,
        // we add it to the array
        if (entity.isActivatable() && !this.entitiesManager.getActivatableEntities().includes(entity)) {
            this.entitiesManager.getActivatableEntities().push(entity);
        }
        this.entitiesManager.refreshEntityCollisionBodies(entity);
        this.scene.markDirty();
    }
}
