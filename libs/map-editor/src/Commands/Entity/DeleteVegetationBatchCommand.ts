import type { WamFile } from "../../GameMap/WamFile";
import { Command } from "../Command";

export class DeleteVegetationBatchCommand extends Command {
    public constructor(
        protected readonly wamFile: WamFile,
        public readonly entityIds: readonly string[],
        commandId?: string,
    ) {
        super(commandId);
    }

    public execute(): Promise<void> {
        const unique = new Set(this.entityIds);
        if (unique.size !== this.entityIds.length) throw new Error("Vegetation delete batch contains duplicate IDs");
        for (const id of this.entityIds) {
            if (!this.wamFile.getGameMapEntities().getEntity(id))
                throw new Error(`Vegetation entity ${id} does not exist`);
        }
        for (const id of this.entityIds) this.wamFile.getGameMapEntities().deleteEntity(id);
        return Promise.resolve();
    }
}
