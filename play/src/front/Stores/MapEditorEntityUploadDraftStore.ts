import type { UploadEntityMessage } from "@workadventure/messages";
import { writable } from "svelte/store";

export type MapEditorEntityUploadDraftStatus = "accepted" | "submitting" | "acknowledged" | "failed";

interface MapEditorEntityUploadDraftBase {
    commandId: string;
    source: Blob;
    sourceName: string;
    previewUrl: string;
    uploadEntityMessage: UploadEntityMessage;
}

export type MapEditorEntityUploadDraft = MapEditorEntityUploadDraftBase &
    ({ status: "accepted" | "submitting" | "acknowledged"; error?: never } | { status: "failed"; error: string });

export type AcceptedMapEditorEntityUploadDraft = MapEditorEntityUploadDraftBase & { status: "accepted" };

function createMapEditorEntityUploadDraftStore() {
    const { subscribe, set, update } = writable<MapEditorEntityUploadDraft | undefined>(undefined);

    const transition = (
        commandId: string,
        expectedStatus: MapEditorEntityUploadDraftStatus,
        nextStatus: "submitting" | "acknowledged",
    ): void => {
        update((draft) => {
            if (draft?.commandId !== commandId || draft.status !== expectedStatus) {
                return draft;
            }
            return {
                commandId: draft.commandId,
                source: draft.source,
                sourceName: draft.sourceName,
                previewUrl: draft.previewUrl,
                uploadEntityMessage: draft.uploadEntityMessage,
                status: nextStatus,
            };
        });
    };

    return {
        subscribe,
        accept: (draft: Omit<AcceptedMapEditorEntityUploadDraft, "status">): void => {
            set({ ...draft, status: "accepted" });
        },
        markSubmitting: (commandId: string): void => {
            transition(commandId, "accepted", "submitting");
        },
        acknowledge: (commandId: string): void => {
            transition(commandId, "submitting", "acknowledged");
        },
        fail: (commandId: string, error: string): void => {
            update((draft) => {
                if (draft?.commandId !== commandId || draft.status !== "submitting") {
                    return draft;
                }
                return { ...draft, status: "failed", error };
            });
        },
        clear: (commandId?: string): void => {
            update((draft) => {
                if (commandId !== undefined && draft?.commandId !== commandId) {
                    return draft;
                }
                return undefined;
            });
        },
    };
}

export const mapEditorEntityUploadDraftStore = createMapEditorEntityUploadDraftStore();
