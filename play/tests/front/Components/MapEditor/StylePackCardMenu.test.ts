import { describe, expect, it } from "vitest";

import cardMenuSource from "../../../../src/front/Components/MapEditor/StylePacks/StylePackCardMenu.svelte?raw";
import entityItemSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityItem/EntityItem.svelte?raw";
import floorEditorSource from "../../../../src/front/Components/MapEditor/FloorEditor/FloorEditor.svelte?raw";

describe("StylePackCardMenu", () => {
    it("keeps the exact copy action and transitions into a disabled-aware target picker", () => {
        expect(cardMenuSource).toContain("copyForStyle");
        expect(cardMenuSource).toContain('menuState = "targets"');
        expect(cardMenuSource).toContain("containingStyleIds.has(style.id)");
        expect(cardMenuSource).toContain("alreadyAdded");
        expect(cardMenuSource).toContain("createAndCopy");
    });

    it("does not trigger the card primary action and restores focus after Escape or outside click", () => {
        expect(cardMenuSource).toContain("event.stopPropagation()");
        expect(cardMenuSource).toContain('event.key !== "Escape"');
        expect(cardMenuSource).toContain('document.addEventListener("pointerdown"');
        expect(cardMenuSource).toContain("triggerElement?.focus()");
        expect(cardMenuSource).toContain('aria-haspopup="menu"');
    });

    it("is connected to both object and terrain cards with metadata snapshots", () => {
        expect(entityItemSource).toContain('<StylePackCardMenu\n        assetKind="object"');
        expect(floorEditorSource).toContain('assetKind="terrain"');
        expect(floorEditorSource).toContain("familyStyleMetadata");
        expect(floorEditorSource).toContain("embeddedStyleMetadata");
    });

    it("keeps a failed target recoverable and confirms success with View", () => {
        expect(cardMenuSource).toContain("pendingTargetId = style.id");
        expect(cardMenuSource).toContain("catch (cause)");
        expect(cardMenuSource).toContain("copiedTo");
        expect(cardMenuSource).toContain("mapEditorStyleStore.selectStyle(successStyle.id)");
    });
});
