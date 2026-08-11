import type { EditMapCommandMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { copyEditMapCommandBinaryPayload } from "../../src/pusher/services/EditMapCommandBinaryPayload";

function detach(buffer: ArrayBuffer): void {
    structuredClone(buffer, { transfer: [buffer] });
}

describe("copyEditMapCommandBinaryPayload", () => {
    it("keeps an entity image after the WebSocket buffer is detached", () => {
        const buffer = new ArrayBuffer(3);
        const transientFile = new Uint8Array(buffer);
        transientFile.set([1, 2, 3]);
        const command: EditMapCommandMessage = {
            id: "command-id",
            editMapMessage: {
                message: {
                    $case: "uploadEntityMessage",
                    uploadEntityMessage: {
                        file: transientFile,
                        id: "entity-id",
                        name: "Small Plant",
                        tags: ["natural"],
                        imagePath: "entity-id.png",
                        direction: 0,
                        color: "#ffffff",
                    },
                },
            },
        };

        copyEditMapCommandBinaryPayload(command);
        detach(buffer);

        expect(transientFile).toHaveLength(0);
        expect(command.editMapMessage?.message?.$case).toBe("uploadEntityMessage");
        if (command.editMapMessage?.message?.$case === "uploadEntityMessage") {
            expect(command.editMapMessage.message.uploadEntityMessage.file).toEqual(new Uint8Array([1, 2, 3]));
        }
    });

    it("keeps a generic uploaded file after the WebSocket buffer is detached", () => {
        const buffer = new ArrayBuffer(2);
        const transientFile = new Uint8Array(buffer);
        transientFile.set([4, 5]);
        const command: EditMapCommandMessage = {
            id: "command-id",
            editMapMessage: {
                message: {
                    $case: "uploadFileMessage",
                    uploadFileMessage: {
                        file: transientFile,
                        id: "file-id",
                        name: "document.pdf",
                        propertyId: "openWebsite",
                    },
                },
            },
        };

        copyEditMapCommandBinaryPayload(command);
        detach(buffer);

        expect(transientFile).toHaveLength(0);
        expect(command.editMapMessage?.message?.$case).toBe("uploadFileMessage");
        if (command.editMapMessage?.message?.$case === "uploadFileMessage") {
            expect(command.editMapMessage.message.uploadFileMessage.file).toEqual(new Uint8Array([4, 5]));
        }
    });
});
