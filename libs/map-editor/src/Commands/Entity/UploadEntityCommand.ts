import type { UploadEntityMessage } from "@workadventure/messages";
import { Command } from "../Command";

export class UploadEntityCommand extends Command {
    protected uploadEntityMessage: UploadEntityMessage;
    protected hostname: string | undefined;

    constructor(uploadEntityMessage: UploadEntityMessage, hostname?: string, commandId?: string) {
        super(commandId);
        this.uploadEntityMessage = uploadEntityMessage;
        this.hostname = hostname;
    }

    execute(): Promise<void> {
        return Promise.resolve();
    }
}
