import { writable } from "svelte/store";

export const loginOverlayVisibleStore = writable(false);

export function openLoginOverlay(): void {
    loginOverlayVisibleStore.set(true);
}

export function closeLoginOverlay(): void {
    loginOverlayVisibleStore.set(false);
}
