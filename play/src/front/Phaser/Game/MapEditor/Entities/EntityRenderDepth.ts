import type { EntityPrefab } from "@workadventure/map-editor";

/** Characters are Y-sorted at their feet, 16 px below their world position. */
export const CHARACTER_FEET_DEPTH_OFFSET = 16;

export function getEntityRenderDepth(
    y: number,
    displayHeight: number,
    prefab: Pick<EntityPrefab, "depthOffset" | "vegetation">,
    elevationOffset = 0,
): number {
    const avatarOcclusionOffset = prefab.vegetation?.category === "tree" ? CHARACTER_FEET_DEPTH_OFFSET : 0;
    return y - elevationOffset + displayHeight + (prefab.depthOffset ?? 0) + avatarOcclusionOffset;
}
