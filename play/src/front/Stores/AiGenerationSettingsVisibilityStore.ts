import { writable } from "svelte/store";

function createAiGenerationSettingsVisibilityStore() {
    const { subscribe, set } = writable(false);
    return {
        subscribe,
        open: () => set(true),
        close: () => set(false),
    };
}

export const aiGenerationSettingsVisibilityStore = createAiGenerationSettingsVisibilityStore();
