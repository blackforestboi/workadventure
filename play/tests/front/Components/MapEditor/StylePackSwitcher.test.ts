import { describe, expect, it } from "vitest";

import switcherSource from "../../../../src/front/Components/MapEditor/StylePacks/StylePackSwitcher.svelte?raw";
import floorEditorSource from "../../../../src/front/Components/MapEditor/FloorEditor/FloorEditor.svelte?raw";
import objectPickerSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityEditorPicker.svelte?raw";

describe("StylePackSwitcher", () => {
    it("selects by stable ID and exposes the shared selector in Terrain and Objects", () => {
        expect(switcherSource).toContain("value={$mapEditorStyleStore.activeStyleId}");
        expect(switcherSource).toContain('value="new-style"');
        expect(floorEditorSource).toContain('<StylePackSwitcher id="terrain-style" compact />');
        expect(objectPickerSource).toContain('<StylePackSwitcher id="object-style" compact />');
    });

    it("retains inline naming state on validation or network failure and supports explicit cancel", () => {
        expect(switcherSource).toContain("bind:value={draftName}");
        expect(switcherSource).toContain("await mapEditorStyleStore.createStyle(draftName)");
        expect(switcherSource).toContain("catch (cause)");
        expect(switcherSource).toContain("onclick={cancelCreate}");
        expect(switcherSource).toContain('maxlength="80"');
    });

    it("reports loading, error, retry and stale-selection fallback states accessibly", () => {
        expect(switcherSource).toContain('aria-live="polite"');
        expect(switcherSource).toContain('$mapEditorStyleStore.status === "loading"');
        expect(switcherSource).toContain("mapEditorStyleStore.hydrate(true)");
        expect(switcherSource).toContain("$mapEditorStyleStore.notice");
    });
});
