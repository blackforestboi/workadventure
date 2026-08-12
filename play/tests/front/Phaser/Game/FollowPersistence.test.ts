import { describe, expect, it } from "vitest";

import playerSource from "../../../../src/front/Phaser/Player/Player.ts?raw";

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
});
