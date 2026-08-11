import { EntityRawPrefab, mapCustomEntityDirectionToDirection, UploadEntityCommand } from "@workadventure/map-editor";
import type { UploadEntityMessage } from "@workadventure/messages";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import { gameManager } from "../../../GameManager";
import type { EntitiesManager } from "../../../GameMap/EntitiesManager";
import type { EntitiesCollectionsManager } from "../../EntitiesCollectionsManager";
import type { FrontCommand } from "../FrontCommand";
import { DeleteCustomEntityFrontCommand } from "./DeleteCustomEntityFrontCommand";

export class UploadEntityFrontCommand extends UploadEntityCommand implements FrontCommand {
    private published = false;

    constructor(
        uploadEntityMessage: UploadEntityMessage,
        private entitiesManager: EntitiesManager,
        private entitiesCollectionManager: EntitiesCollectionsManager,
        commandId?: string,
        private readonly storageWriteAlreadyCompleted = false,
    ) {
        super(uploadEntityMessage, undefined, commandId);
    }

    emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitMapEditorUploadEntity(this.commandId, this.uploadEntityMessage);
    }

    execute(): Promise<void> {
        if (this.storageWriteAlreadyCompleted) {
            this.publishUploadedEntity();
        }

        return super.execute();
    }

    onAcknowledged(): void {
        this.publishUploadedEntity();
    }

    private publishUploadedEntity(): void {
        if (this.published) {
            return;
        }

        try {
            const uploadedEntity = EntityRawPrefab.parse({
                ...this.uploadEntityMessage,
                direction: mapCustomEntityDirectionToDirection(this.uploadEntityMessage.direction),
            });
            const customEntityCollectionUrl = gameManager.getCurrentGameScene().getCustomEntityCollectionUrl();
            this.entitiesCollectionManager.addUploadedEntity(uploadedEntity, customEntityCollectionUrl);
            this.published = true;
        } catch (e) {
            console.error(e);
        }
    }

    getUndoCommand(): DeleteCustomEntityFrontCommand {
        return new DeleteCustomEntityFrontCommand(
            { id: this.uploadEntityMessage.id },
            gameManager.getCurrentGameScene().getGameMap().getWamFile(),
            this.entitiesManager,
            this.entitiesCollectionManager,
        );
    }
}
