import { ModifyCustomEntityCommand } from "@workadventure/map-editor";
import type { ModifyCustomEntityMessage } from "@workadventure/messages";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import type { FrontCommand } from "../FrontCommand";
import type { EntitiesCollectionsManager } from "../../EntitiesCollectionsManager";
import type { GameMapFrontWrapper } from "../../../GameMap/GameMapFrontWrapper";
import type { EntitiesManager } from "../../../GameMap/EntitiesManager";

export class ModifyCustomEntityFrontCommand extends ModifyCustomEntityCommand implements FrontCommand {
    constructor(
        modifyCustomEntityMessage: ModifyCustomEntityMessage,
        private entitiesCollectionManager: EntitiesCollectionsManager,
        private gameFrontWrapper: GameMapFrontWrapper,
        private entitiesManager: EntitiesManager,
    ) {
        super(modifyCustomEntityMessage);
    }

    emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorModifyCustomEntity(this.commandId, this.modifyCustomEntityMessage);
    }

    execute(): Promise<void> {
        const {
            id,
            name,
            tags,
            animation,
            depthOffset,
            collisionGrid,
            defaultSizeInTiles,
            defaultHeightInTiles,
            previewPadding,
        } = this.modifyCustomEntityMessage;
        this.entitiesCollectionManager.modifyCustomEntity(
            id,
            name,
            tags,
            depthOffset,
            collisionGrid,
            defaultSizeInTiles,
            defaultHeightInTiles,
            animation,
            previewPadding,
        );
        this.entitiesManager.updateEntitiesPrefabMetadata(id, {
            name,
            tags,
            collisionGrid,
            depthOffset,
            defaultSizeInTiles,
            defaultHeightInTiles,
            ...(animation === undefined ? {} : { animation }),
        });
        this.gameFrontWrapper.recomputeEntitiesCollisionGrid();
        return super.execute();
    }

    getUndoCommand(): ModifyCustomEntityFrontCommand {
        throw new Error("Not supported.");
    }
}
