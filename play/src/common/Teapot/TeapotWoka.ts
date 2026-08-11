export const TEAPOT_WOKA_CATEGORIES = ["woka", "body", "eyes", "hair", "clothes", "hat", "accessory"] as const;

export type TeapotWokaCategory = (typeof TEAPOT_WOKA_CATEGORIES)[number];

export function readTeapotWokaCategory(metadata: unknown): TeapotWokaCategory {
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return "woka";
    const category = (metadata as Record<string, unknown>).category;
    return TEAPOT_WOKA_CATEGORIES.find((candidate) => candidate === category) ?? "woka";
}

export const TEAPOT_WOKA_SPRITE_SHEET = {
    width: 96,
    height: 128,
    frameWidth: 32,
    frameHeight: 32,
    frameColumns: 3,
    frameRows: 4,
} as const;
