import { CustomEntityDirection, type UploadEntityMessage } from "@workadventure/messages";
import { get } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";
import { mapEditorEntityUploadDraftStore } from "../../../src/front/Stores/MapEditorEntityUploadDraftStore";

const uploadEntityMessage: UploadEntityMessage = {
    id: "entity-id",
    file: new Uint8Array([1, 2, 3]),
    direction: CustomEntityDirection.Down,
    name: "Generated tree",
    tags: ["Nature"],
    imagePath: "entity-id-generated-tree.png",
    color: "",
};

const acceptDraft = (): Blob => {
    const source = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    mapEditorEntityUploadDraftStore.accept({
        commandId: "command-id",
        source,
        sourceName: "generated-tree.png",
        previewUrl: "blob:generated-tree",
        uploadEntityMessage,
    });
    return source;
};

describe("mapEditorEntityUploadDraftStore", () => {
    afterEach(() => {
        mapEditorEntityUploadDraftStore.clear();
    });

    it("keeps the accepted source and preview through a failed submission so it can be retried", () => {
        const source = acceptDraft();

        mapEditorEntityUploadDraftStore.markSubmitting("command-id");
        mapEditorEntityUploadDraftStore.fail("command-id", "Map storage is unavailable");

        expect(get(mapEditorEntityUploadDraftStore)).toEqual(
            expect.objectContaining({
                commandId: "command-id",
                status: "failed",
                source,
                previewUrl: "blob:generated-tree",
                uploadEntityMessage,
                error: "Map storage is unavailable",
            }),
        );
    });

    it("ignores acknowledgements for another command", () => {
        acceptDraft();
        mapEditorEntityUploadDraftStore.markSubmitting("command-id");

        mapEditorEntityUploadDraftStore.acknowledge("stale-command-id");

        expect(get(mapEditorEntityUploadDraftStore)?.status).toBe("submitting");
    });

    it("moves the matching submitted draft to acknowledged", () => {
        acceptDraft();
        mapEditorEntityUploadDraftStore.markSubmitting("command-id");

        mapEditorEntityUploadDraftStore.acknowledge("command-id");

        expect(get(mapEditorEntityUploadDraftStore)?.status).toBe("acknowledged");
    });
});
