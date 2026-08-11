import { AssetGenerationError } from "./AssetGenerationError";
import type { AssetGenerationReference, AssetGenerationRequest, AssetGenerationTarget } from "./AssetGenerationTypes";
import type { RasterOutputSize } from "./RasterOutputNormalizer";
import { createDefaultWokaStyleReference } from "./DefaultWokaStyleReference";

export const WOKA_IDLE_FRAME_OUTPUT = {
    width: 240,
    height: 240,
    pixelated: false,
} as const satisfies RasterOutputSize;

export const WOKA_SPRITE_SHEET_LAYOUT = {
    width: 96,
    height: 128,
    frameWidth: 32,
    frameHeight: 32,
    columns: 3,
    rows: ["down", "left", "right", "up"],
    framesPerRow: 3,
} as const;

export interface WokaIdleFrameStageInput {
    modelId: string;
    target: WokaGenerationTarget;
    description: string;
    references?: readonly AssetGenerationReference[];
}

export interface WokaSpriteSheetStageInput {
    modelId: string;
    target: WokaGenerationTarget;
    description: string;
    acceptedSeed: AssetGenerationReference;
}

export type WokaGenerationTarget = Exclude<AssetGenerationTarget, "environment-object" | "tileset">;

export interface WokaIdleFrameStage {
    stage: "idle-frame";
    outputSize: RasterOutputSize;
    request: AssetGenerationRequest;
}

export interface WokaSpriteSheetStage {
    stage: "sprite-sheet";
    outputSize: RasterOutputSize;
    layout: typeof WOKA_SPRITE_SHEET_LAYOUT;
    request: AssetGenerationRequest;
}

export function createWokaIdleFrameStage(input: WokaIdleFrameStageInput): WokaIdleFrameStage {
    const userReferences = input.references ?? [];
    const useCompositionReference = input.modelId !== "recraft/recraft-v4.1";
    return {
        stage: "idle-frame",
        outputSize: { ...WOKA_IDLE_FRAME_OUTPUT },
        request: {
            modelId: input.modelId,
            target: input.target,
            // Put the fixed Woka geometry before the creative description.
            // Image models otherwise tend to follow a "wizard" or similar
            // identity brief with adult proportions before they reach the
            // animation contract.
            prompt: joinPrompt(idleFrameRules(input.target, useCompositionReference), input.description),
            outputCount: 1,
            references: useCompositionReference
                ? [createDefaultWokaStyleReference(), ...userReferences.slice(0, 13)]
                : userReferences.slice(0, 1),
            outputFormat: "webp",
            background: "transparent",
        },
    };
}

export function createWokaSpriteSheetStage(input: WokaSpriteSheetStageInput): WokaSpriteSheetStage {
    requireAcceptedPngSeed(input.acceptedSeed);
    return {
        stage: "sprite-sheet",
        outputSize: {
            width: WOKA_SPRITE_SHEET_LAYOUT.width,
            height: WOKA_SPRITE_SHEET_LAYOUT.height,
            pixelated: true,
        },
        layout: WOKA_SPRITE_SHEET_LAYOUT,
        request: {
            modelId: input.modelId,
            target: input.target,
            prompt: joinPrompt(input.description, spriteSheetRules(input.target)),
            outputCount: 1,
            references: [input.acceptedSeed],
            outputFormat: "webp",
            background: "transparent",
        },
    };
}

function idleFrameRules(target: WokaGenerationTarget, usesCompositionReference: boolean): string {
    const subject = target === "complete-woka" ? "the complete character" : `only the ${target.slice(5)} layer`;
    const framingSubject = target === "complete-woka" ? "the full figure" : "the requested layer";
    const isolationRule =
        target === "complete-woka"
            ? "Center the full character inside the frame"
            : "Keep every pixel outside that single avatar layer transparent";
    return [
        "HIGHEST-PRIORITY WOKA BODY GEOMETRY: this is a chibi Woka, never an adult-proportioned character. The rounded head and face (not counting a hat, horns, hair, or other accessories) occupy roughly half of the standing figure's height and are visibly wider than the compact torso. The torso from shoulders to hips is short—at most one quarter of the figure height. Arms and legs are short, stubby limbs. Do not make a long robe, long torso, long neck, long legs, realistic adult body, or fashion-illustration silhouette. Accessories must decorate the oversized head or compact body; they must not make the figure read as tall or adult.",
        `Generate exactly one detailed square design of ${subject}. This is the fixed Woka front-idle pose: a direct 0-degree front elevation facing straight into the camera (the WorkAdventure down direction). The camera is perpendicular to the chest and face: 0-degree yaw, 0-degree pitch, and 0-degree roll. Never make a side, three-quarter, back, walking, leaning, seated, action, or head-turned pose.`,
        `Rigid pose and framing contract, independent of the requested visual style: show ${framingSubject} entirely inside the canvas, centred on the vertical axis, upright, and at one consistent scale. The vertical centreline must run through the forehead, nose, sternum, belt centre, and gap between the feet. Both eyes, ears, shoulders, hands, knees, and feet must be equally visible on either side of that centreline. The head is above the torso; the torso is vertical; shoulders are level; both arms hang naturally and symmetrically at the sides; both legs are vertical, parallel, and evenly spaced; both feet are flat on one shared horizontal ground line. A visibly narrower far shoulder, one eye hidden, a turned nose, offset chest, or one foot laterally ahead is a rejected three-quarter pose. Do not crop, tilt, rotate, float, or place any part of the body off canvas.`,
        "This neutral front idle is the canonical anchor for every later walking frame. The requested style changes only appearance, never this direct frontal camera angle, pose, framing, limb placement, facing direction, or body alignment. If an accessory is requested, keep the character front-facing and do not use the accessory to turn the torso or obscure an arm, eye, or foot.",
        "Make the character large and clearly readable in the preview, with a clean silhouette and enough detail to judge the face, body, clothing, and accessories.",
        usesCompositionReference
            ? "The first reference is the bundled vanilla WorkAdventure Woka's unclothed neutral body. It is a mandatory anatomy and composition guide: preserve its oversized rounded head, compact small torso, short arms and legs, upright centred front pose, and shared foot baseline. Its low-resolution pixel look, skin colour, blank face, and lack of clothing are NOT style references—create the requested identity and visual style at the provider's full output resolution."
            : "Follow the written pose and framing contract exactly. If a user reference is supplied, use it only for character identity and visual style; do not copy its pose, framing, or background.",
        "This is one isolated figurine only: do not create a sprite sheet, grid, contact sheet, animation sequence, alternate pose, repeated figure, or extra character.",
        `${isolationRule} on a transparent background with no text, border, shadow, scenery, floor, ground plane, terrain, grass, path, pedestal, platform, or contact shadow. The avatar must be free-standing.`,
    ].join(" ");
}

function spriteSheetRules(target: WokaGenerationTarget): string {
    const consistencyRule =
        target === "complete-woka"
            ? "Keep identity, proportions, colors, clothing, and accessories consistent in every frame."
            : `Generate only the ${target.slice(5)} layer and keep every pixel outside that layer transparent in every frame.`;
    return [
        "Use the required accepted PNG reference as the canonical design and down-facing idle anchor.",
        "Generate exactly one 96x128 pixel transparent PNG sprite sheet made from a 3-column by 4-row grid of 32x32 pixel frames.",
        "Order the rows exactly as down, left, right, up.",
        "Put exactly three aligned frames in each row: walking step A, idle, walking step B; the accepted seed defines the middle idle frame of the down row.",
        consistencyRule,
        "Use no gutters, labels, border, shadow, scenery, or extra poses.",
    ].join(" ");
}

function requireAcceptedPngSeed(reference: AssetGenerationReference): void {
    if (reference.mimeType !== "image/png" || reference.blob.type !== "image/png") {
        throw new AssetGenerationError(
            "invalid_request",
            "Stage 2 requires the accepted stage-1 PNG as its reference image.",
        );
    }
}

function joinPrompt(description: string, rules: string): string {
    const trimmedDescription = description.trim();
    return trimmedDescription === "" ? rules : `${trimmedDescription}\n\n${rules}`;
}
