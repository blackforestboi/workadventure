import type { DeleteCustomEntityMessage } from "@workadventure/messages";
import { Command } from "../Command";
import type { WamFile } from "../../GameMap/WamFile";

export class DeleteCustomEntityCommand extends Command {
    protected deleteCustomEntityMessage: DeleteCustomEntityMessage;
    protected hostname: string | undefined;
    protected wamFile: WamFile | undefined;

    constructor(deleteCustomEntityMessage: DeleteCustomEntityMessage, wamFile?: WamFile, hostname?: string) {
        super();
        this.deleteCustomEntityMessage = deleteCustomEntityMessage;
        this.hostname = hostname;
        this.wamFile = wamFile;
    }

    execute(): Promise<void> {
        if (this.wamFile !== undefined) {
            const referencedByPreset = this.wamFile
                .getVegetationPresets()
                ?.presets.some((preset) =>
                    preset.species.some(({ prefabRef }) => prefabRef.id === this.deleteCustomEntityMessage.id),
                );
            const referencedByEntity =
                this.wamFile.getGameMapEntities().findEntitiesByPrefabId(this.deleteCustomEntityMessage.id).length > 0;
            if (referencedByPreset || referencedByEntity) {
                throw new Error(
                    `Vegetation prefab ${this.deleteCustomEntityMessage.id} cannot be deleted while it is in use`,
                );
            }
        }
        return Promise.resolve();
    }
}
