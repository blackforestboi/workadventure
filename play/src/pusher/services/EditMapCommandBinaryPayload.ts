import type { EditMapCommandMessage } from "@workadventure/messages";

/**
 * Copies binary data decoded from an incoming uWebSockets message before an
 * asynchronous boundary. uWebSockets owns the callback's ArrayBuffer and may
 * invalidate it as soon as the callback yields.
 */
export function copyEditMapCommandBinaryPayload(command: EditMapCommandMessage): void {
    const message = command.editMapMessage?.message;

    if (message?.$case === "uploadEntityMessage") {
        message.uploadEntityMessage.file = Uint8Array.from(message.uploadEntityMessage.file);
    } else if (message?.$case === "uploadFileMessage") {
        message.uploadFileMessage.file = Uint8Array.from(message.uploadFileMessage.file);
    }
}
