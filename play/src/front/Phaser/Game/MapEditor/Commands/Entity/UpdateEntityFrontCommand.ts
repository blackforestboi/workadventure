import type { WamFile, WAMEntityData, WAMFileFormat } from "@workadventure/map-editor";
import { UpdateEntityCommand } from "@workadventure/map-editor";
import type { EntitiesManager } from "../../../GameMap/EntitiesManager";
import type { Entity } from "../../../../ECS/Entity";
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
        const oldCollisionPosition = entity.getCollisionGridPosition();
        const oldCollisionGrid = entity.getCollisionGrid();
        entity?.updateEntity(config);
        // If the entity is activable, and not in the activatable entities array of the entity manager,
        // we add it to the array
        if (entity.isActivatable() && !this.entitiesManager.getActivatableEntities().includes(entity)) {
            this.entitiesManager.getActivatableEntities().push(entity);
        }
        this.updateCollisionGrid(entity, oldCollisionPosition.x, oldCollisionPosition.y, oldCollisionGrid);
        this.scene.markDirty();
    }

    private updateCollisionGrid(
        entity: Entity,
        oldX: number,
        oldY: number,
        oldCollisionGrid: number[][] | undefined,
    ): void {
        const reversedGrid = oldCollisionGrid?.map((row) => row.map((value) => (value === 1 ? -1 : value)));
        const grid = entity.getCollisionGrid();
        if (reversedGrid) {
            this.scene.getGameMapFrontWrapper().modifyToCollisionsLayer(oldX, oldY, "0", reversedGrid);
        }
        if (grid) {
            const collisionPosition = entity.getCollisionGridPosition();
            this.scene
                .getGameMapFrontWrapper()
                .modifyToCollisionsLayer(collisionPosition.x, collisionPosition.y, "0", grid);
        }
    }
}
