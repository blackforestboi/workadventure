// @vitest-environment jsdom

import { readable } from "svelte/store";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapEditorWorldPicker from "./MapEditorWorldPicker.svelte";

vi.mock("../../../i18n/i18n-svelte", () => ({
    LL: readable({
        actionbar: {
            mapEditor: () => "Map editor",
            mapEditorThisWorld: () => "This world",
            mapEditorCreateNew: () => "Create new",
            mapEditorCreating: () => "Creating world…",
        },
    }),
}));

let target: HTMLElement;

beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
});

afterEach(() => target.remove());

describe("MapEditorWorldPicker", () => {
    it("opens the current world and closes the picker", async () => {
        const onthisworld = vi.fn();
        const onclose = vi.fn();
        const component = mount(MapEditorWorldPicker, { target, props: { onthisworld, onclose } });
        flushSync();

        target.querySelector<HTMLButtonElement>('[data-testid="map-editor-this-world"]')?.click();

        expect(onthisworld).toHaveBeenCalledOnce();
        expect(onclose).toHaveBeenCalledOnce();
        await unmount(component);
    });

    it("runs create new once and exposes its loading state", async () => {
        let resolveCreation: (() => void) | undefined;
        const oncreatenew = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveCreation = resolve;
                }),
        );
        const component = mount(MapEditorWorldPicker, { target, props: { oncreatenew } });
        flushSync();
        const button = target.querySelector<HTMLButtonElement>('[data-testid="map-editor-create-new"]');

        button?.click();
        button?.click();
        await tick();

        expect(oncreatenew).toHaveBeenCalledOnce();
        expect(button?.disabled).toBe(true);
        expect(button?.textContent).toContain("Creating world…");

        resolveCreation?.();
        await vi.waitFor(() => expect(button?.disabled).toBe(false));

        await unmount(component);
    });
});
