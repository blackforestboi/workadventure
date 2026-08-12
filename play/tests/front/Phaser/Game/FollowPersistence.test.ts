import { describe, expect, it } from "vitest";

import contextualMenuSource from "../../../../src/front/Components/ActionBar/MenuIcons/ContextualMenuItems.svelte?raw";
import voicePinMenuSource from "../../../../src/front/Components/ActionBar/MenuIcons/VoicePinMenuItem.svelte?raw";
import playerSource from "../../../../src/front/Phaser/Player/Player.ts?raw";
import followStoreSource from "../../../../src/front/Stores/FollowStore.ts?raw";

describe("follow persistence", () => {
    it("does not abort an active follow when the leader sprite is temporarily unavailable", () => {
        const computeFollowMovementSource = playerSource.match(
            /private computeFollowMovement\(\): number\[\] \{[\s\S]*?\n {4}\}\n\n {4}private getMovementDirection/,
        )?.[0];

        expect(computeFollowMovementSource).toBeDefined();
        expect(computeFollowMovementSource).toContain("this.scene.MapPlayersByKey.get(get(followUsersStore)[0])");
        expect(computeFollowMovementSource).toContain("return [0, 0]");
        expect(computeFollowMovementSource).not.toContain("emitFollowAbort");
        expect(computeFollowMovementSource).not.toContain('followStateStore.set("off")');
    });

    it("keeps voice-only pins active without applying follow movement", () => {
        const moveUserSource = playerSource.match(/public moveUser[\s\S]*?\n {4}\}\n\n {4}public rotate/)?.[0];

        expect(moveUserSource).toBeDefined();
        expect(moveUserSource).toContain('get(followConnectionModeStore) === "movement"');
        expect(moveUserSource).toContain("this.computeFollowMovement()");
        expect(followStoreSource).toContain('export type FollowConnectionMode = "movement" | "voice"');
        expect(followStoreSource).toContain('followConnectionModeStore.set(voiceOnly ? "voice" : "movement")');
    });

    it("offers a separate voice pin control that explicitly requests voice-only follow", () => {
        expect(contextualMenuSource).toContain("<FollowMenuItem />");
        expect(contextualMenuSource).toContain("<VoicePinMenuItem />");
        expect(voicePinMenuSource).toContain("emitFollowRequest(false, true)");
        expect(voicePinMenuSource).toContain("emitFollowAbort()");
    });
});
