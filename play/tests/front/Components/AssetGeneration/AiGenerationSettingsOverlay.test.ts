import { describe, expect, it } from "vitest";

import settingsOverlaySource from "../../../../src/front/Components/AssetGeneration/AiGenerationSettingsOverlay.svelte?raw";
import avatarWizardSource from "../../../../src/front/Components/AssetGeneration/AvatarGenerationWizard.svelte?raw";

function modalLayer(source: string): number {
    const match = source.match(/class="fixed inset-0 z-\[(\d+)\]/);
    if (match?.[1] === undefined) throw new Error("Expected a fixed modal layer");
    return Number(match[1]);
}

describe("AI generation settings overlay", () => {
    it("closes after a connected direct OpenRouter key", () => {
        expect(settingsOverlaySource).toMatch(
            /async function verifyOpenRouterKey[\s\S]*?await assetGenerationSettings\.connectWithApiKey[\s\S]*?if \(\$assetGenerationSettings\.lifecycle === "connected"\) \{\s*close\(\);\s*\}/,
        );
    });

    it("closes after a connected saved-key unlock", () => {
        expect(settingsOverlaySource).toMatch(
            /async function reconnectSaved[\s\S]*?await assetGenerationSettings\.reconnectSavedCredential\(passphrase\);\s*if \(\$assetGenerationSettings\.lifecycle === "connected"\) \{\s*close\(\);\s*\}/,
        );
    });

    it("stays above the avatar editor when a missing key opens it", () => {
        expect(modalLayer(settingsOverlaySource)).toBeGreaterThan(modalLayer(avatarWizardSource));
    });
});
