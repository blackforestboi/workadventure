import { describe, expect, it } from "vitest";

import settingsOverlaySource from "../../../../src/front/Components/AssetGeneration/AiGenerationSettingsOverlay.svelte?raw";

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
});
