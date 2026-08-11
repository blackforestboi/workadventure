import { AssetGenerationError } from "./AssetGenerationError";
import type { AssetGenerationReference, AssetGenerationRequest } from "./AssetGenerationTypes";
import { normalizeGeneratedRaster } from "./RasterOutputNormalizer";

export const WOKA_DIRECTIONAL_FRAMES = [
    {
        direction: "down",
        motion: "walking step A",
        row: 0,
        column: 0,
        poseDescription:
            "Front view walking toward the viewer and image bottom. There must be exactly ONE advanced foot: the character's biological LEFT foot is the forward foot. In a front view, biological LEFT appears on SCREEN-RIGHT: place the SCREEN-RIGHT foot visibly lower/closer to the viewer, ahead of the other foot. The biological RIGHT foot appears on SCREEN-LEFT and must be visibly higher/farther back. The SCREEN-RIGHT (biological LEFT) arm is swung BACK/away from the viewer; the SCREEN-LEFT (biological RIGHT) arm and hand are swung FORWARD/toward the viewer. The legs must be separated with unequal vertical depth; if both feet are level, parallel, or equally forward this frame is wrong. This is a wide, visibly asymmetric contact pose, not idle.",
    },
    {
        direction: "down",
        motion: "idle",
        row: 0,
        column: 1,
        poseDescription:
            "Front view facing the viewer and image bottom. Neither foot is forward or behind: biological LEFT and RIGHT feet are level, parallel, evenly planted beneath the hips, and carry equal weight. Neither arm swings: both arms rest symmetrically at the sides. This is neutral standing and must not resemble either walking extreme.",
    },
    {
        direction: "down",
        motion: "walking step B",
        row: 0,
        column: 2,
        poseDescription:
            "Front view walking toward the viewer and image bottom. This is the exact opposite of down step A. There must be exactly ONE advanced foot: the character's biological RIGHT foot is the forward foot. In a front view, biological RIGHT appears on SCREEN-LEFT: place the SCREEN-LEFT foot visibly lower/closer to the viewer, ahead of the other foot. The biological LEFT foot appears on SCREEN-RIGHT and must be visibly higher/farther back. The SCREEN-LEFT (biological RIGHT) arm is swung BACK/away from the viewer; the SCREEN-RIGHT (biological LEFT) arm and hand are swung FORWARD/toward the viewer. The legs must be separated with unequal vertical depth; if both feet are level, parallel, or equally forward this frame is wrong. This must be the exact opposite asymmetric contact pose from step A, never a duplicate of step A or idle.",
    },
    {
        direction: "left",
        motion: "walking step A",
        row: 1,
        column: 0,
        poseDescription:
            "Strict left-facing profile walking toward the screen-left edge. Use the camera-facing (nearest, fully visible) arm and hand as the primary swing limb: swing that hand FORWARD toward SCREEN-LEFT, clearly in front of the torso. Use the camera-facing foot as the primary step: extend that foot FORWARD toward SCREEN-LEFT. The other foot must be the opposite contact, back toward SCREEN-RIGHT. Nose, chest, knees, and toes point left. The two feet must have clearly different horizontal positions; if they overlap, are level, or both point equally left this frame is wrong. This is the forward-contact half of the walk cycle, not idle.",
    },
    {
        direction: "left",
        motion: "idle",
        row: 1,
        column: 1,
        poseDescription:
            "Strict left-facing profile. Nose, chest, knees, and toes point to screen-left. Neither foot is in front or behind: biological LEFT and RIGHT feet are together and level beneath the upright torso. Neither arm is in front or behind: both arms hang neutrally without a walking swing. This centred standing pose must be visibly different from both walking extremes.",
    },
    {
        direction: "left",
        motion: "walking step B",
        row: 1,
        column: 2,
        poseDescription:
            "Strict left-facing profile walking toward the screen-left edge. This is the exact opposite of left step A. Use the camera-facing (nearest, fully visible) arm and hand as the primary swing limb: swing that hand BACK toward SCREEN-RIGHT, clearly behind the torso. Use the camera-facing foot as the primary step: place that foot BACK toward SCREEN-RIGHT. The other foot must be the opposite contact, forward toward SCREEN-LEFT. Nose, chest, knees, and toes point left. The two feet must have clearly different horizontal positions; if they overlap, are level, or both point equally left this frame is wrong. This is the back-contact half of the walk cycle, never a duplicate of step A or idle.",
    },
    {
        direction: "right",
        motion: "walking step A",
        row: 2,
        column: 0,
        poseDescription:
            "Horizontal pixel mirror of left step A: strict right-facing profile walking screen-right, with every foot and arm position exactly mirrored. Do not independently reinterpret or regenerate this frame.",
    },
    {
        direction: "right",
        motion: "idle",
        row: 2,
        column: 1,
        poseDescription:
            "Horizontal pixel mirror of left idle: strict right-facing neutral profile, with every body, foot, arm, accessory, and asymmetric detail exactly mirrored. Do not independently reinterpret or regenerate this frame.",
    },
    {
        direction: "right",
        motion: "walking step B",
        row: 2,
        column: 2,
        poseDescription:
            "Horizontal pixel mirror of left step B: strict right-facing profile walking screen-right, with every foot and arm position exactly mirrored. Do not independently reinterpret or regenerate this frame.",
    },
    {
        direction: "up",
        motion: "walking step A",
        row: 3,
        column: 0,
        poseDescription:
            "Centred back view walking away from the viewer toward image top. There must be exactly ONE advanced foot: biological LEFT foot is the forward foot. In a back view, biological LEFT appears on SCREEN-LEFT: place the SCREEN-LEFT foot visibly higher/farther away, ahead of the other foot. The biological RIGHT foot appears on SCREEN-RIGHT and must be visibly lower/closer to the viewer. The SCREEN-LEFT (biological LEFT) arm and hand are swung BACK/toward the viewer; the SCREEN-RIGHT (biological RIGHT) arm and hand are swung FORWARD/away from the viewer. The legs must be separated with unequal vertical depth; if both feet are level, parallel, or equally forward this frame is wrong. Face and chest are hidden. This is a wide asymmetric contact pose, not idle.",
    },
    {
        direction: "up",
        motion: "idle",
        row: 3,
        column: 1,
        poseDescription:
            "Centred back view facing away from the viewer toward image top. Neither foot is forward or behind: biological LEFT and RIGHT feet are level, parallel, and evenly planted. Neither arm swings: both arms rest symmetrically at the sides. Back of head, back, and heels are visible; face and chest are hidden. This neutral standing pose must differ from both walking extremes.",
    },
    {
        direction: "up",
        motion: "walking step B",
        row: 3,
        column: 2,
        poseDescription:
            "Centred back view walking away from the viewer toward image top. This is the exact opposite of up step A. There must be exactly ONE advanced foot: biological RIGHT foot is the forward foot. In a back view, biological RIGHT appears on SCREEN-RIGHT: place the SCREEN-RIGHT foot visibly higher/farther away, ahead of the other foot. The biological LEFT foot appears on SCREEN-LEFT and must be visibly lower/closer to the viewer. The SCREEN-RIGHT (biological RIGHT) arm and hand are swung BACK/toward the viewer; the SCREEN-LEFT (biological LEFT) arm and hand are swung FORWARD/away from the viewer. The legs must be separated with unequal vertical depth; if both feet are level, parallel, or equally forward this frame is wrong. Face and chest are hidden. This must be the exact opposite asymmetric contact pose from step A, never a duplicate of step A or idle.",
    },
] as const;

export type WokaDirectionalFrame = (typeof WOKA_DIRECTIONAL_FRAMES)[number];
/** The approved front design is the down idle; the others are generated from it first. */
export const WOKA_NEUTRAL_FRAME_INDEXES = [4, 7, 10] as const;
export const WOKA_STEP_FRAME_INDEXES = [0, 2, 3, 5, 6, 8, 9, 11] as const;
export interface WokaFrameSize {
    width: number;
    height: number;
}

export function neutralAnchorFrameIndex(index: number): number | undefined {
    const frame = WOKA_DIRECTIONAL_FRAMES[index];
    if (frame === undefined) return undefined;
    return ({ down: 1, left: 4, right: 7, up: 10 } as const)[frame.direction];
}

export function createDirectionalFrameRequest(
    modelId: string,
    description: string,
    style: string,
    avatarDesign: AssetGenerationReference,
    poseReference: AssetGenerationReference,
    outputSize: WokaFrameSize,
    frame: WokaDirectionalFrame,
    sourceIsOppositeStride = false,
): AssetGenerationRequest {
    return {
        modelId,
        target: "complete-woka",
        prompt: [
            description,
            style,
            `Generate exactly one ${outputSize.width}x${outputSize.height} image of this avatar facing ${frame.direction} in the ${frame.motion} pose.`,
            "Fixed Woka animation contract, independent of the requested visual style: this frame's direction, camera view, full-body posture, limb placement, body alignment, and framing are mandatory. The creative brief can change identity and rendering only; it must never change the pose.",
            `Exact body-mechanics contract: ${frame.poseDescription}`,
            "Direction convention is screen-relative and non-negotiable: down = front view facing the viewer; up = back view walking away; left = strict profile facing screen-left; right = strict profile facing screen-right.",
            "Walk-cycle acceptance check is non-negotiable: for SIDE views, follow the direction-specific camera-facing arm and foot instruction literally; do not reason about anatomical left or right. For FRONT and BACK views, follow the explicit biological LEFT/RIGHT foot and arm instructions in the pose contract. Step A and Step B must invert the instructed hand swing and foot placement, producing clearly different silhouettes. A walking frame with equal feet, a duplicated pose, or an almost-idle stance is invalid. Never reuse, duplicate, or minimally vary another frame's pose. Idle is the centred neutral standing pose with no forward foot and no arm swing. Do not substitute a three-quarter view or turn the head toward camera.",
            "Framing is non-negotiable in every direction and every step: show the complete avatar fully inside the canvas, centred horizontally, upright, at the same scale as every other frame, with feet on one shared horizontal baseline near the lower canvas margin. Never crop, tilt, rotate, float, shift off-screen, change scale, or add perspective.",
            `Match the approved front design's exact ${outputSize.width}x${outputSize.height} source resolution. Do not return a thumbnail, preview-sized copy, or differently sized canvas.`,
            sourceIsOppositeStride
                ? "The first reference is this direction's already-completed Step A image. It is the canonical identity source: preserve its identity, proportions, colors, clothing, accessories, visual style, camera view, direction, and every held object exactly. Before drawing, privately INSPECT that Step A image and identify: (1) which visible foot is lower/closer/advanced, and (2) whether the corresponding visible arm is forward or back. Then compare it with the second reference, which is the required Step B pose guide. Render the exact OPPOSITE contact: the visible foot that was advanced in Step A must now be back, the other foot must now be advanced, and the visible arm swing must reverse. Step B is invalid if it keeps Step A's foot/arm silhouette, looks almost the same, or only changes colour/detail."
                : "The first reference is the approved neutral orientation anchor for this direction. Preserve its identity, proportions, colors, clothing, accessories, visual style, camera view, and direction exactly; alter only the specified walking stride when creating a step frame.",
            "Handheld-object continuity is mandatory within this direction's idle, Step A, and Step B sequence. First inspect the first reference: if it contains NO handheld object, do NOT invent, add, or introduce any staff, tool, weapon, bag, book, wand, or prop. If it does contain a handheld object, keep that exact object continuously in the SAME biological hand throughout all three frames. Never move it to the other hand, drop it, hide it, duplicate it, replace it, or make it switch sides between frames. Only the arm swing and leg stride may change around the held object.",
            `The second reference is an enlarged crop from a bundled, fully clothed vanilla Woka walk cycle showing this exact ${frame.direction} ${frame.motion} posture. Treat its silhouette, facing direction, limb positions, planted foot, moving foot, arm swing, and weight shift as authoritative pose geometry.`,
            "The bundled pose reference also defines the mandatory Woka body container: a large rounded head occupying roughly the upper half of the figure, a compact small torso, and short limbs. Preserve that body silhouette and limb scale in the approved avatar. Do NOT copy its face, hair, clothing, skin color, low resolution, rendering style, or pixel-art treatment; transfer its body shape and pose only.",
            "Return one isolated free-standing full-body avatar only on a transparent background. Do not create a sprite sheet, grid, contact sheet, labels, scenery, floor, ground plane, terrain, grass, path, pedestal, platform, contact shadow, repeated figure, or alternate pose.",
        ]
            .filter(Boolean)
            .join("\n\n"),
        outputCount: 1,
        references: [avatarDesign, poseReference],
        outputFormat: "webp",
        background: "transparent",
    };
}

let poseReferencesPromise: Promise<readonly AssetGenerationReference[]> | undefined;

// A fully composed bundled Woka makes the moving arm and leg much easier for
// an image model to read than the naked base-body layer. The 3x4 timing and
// geometry remain the exact WorkAdventure walk cycle.
const DEFAULT_WOKA_POSE_LAYERS = [
    "/resources/customisation/character_color/character_color9.png",
    "/resources/customisation/character_clothes/character_clothes17.png",
    "/resources/customisation/character_eyes/character_eyes23.png",
] as const;

export function loadDefaultWokaPoseReferences(): Promise<readonly AssetGenerationReference[]> {
    poseReferencesPromise ??= createPoseReferences();
    return poseReferencesPromise;
}

async function createPoseReferences(): Promise<readonly AssetGenerationReference[]> {
    const layers = await Promise.all(DEFAULT_WOKA_POSE_LAYERS.map(loadWokaPoseLayer));
    const bitmap = await composeWokaPoseSheet(layers);
    try {
        return await Promise.all(
            WOKA_DIRECTIONAL_FRAMES.map(async (frame) => ({
                id: `woka-pose-${frame.direction}-${frame.column}`,
                blob: await cropFrame(bitmap, frame.column * 32, frame.row * 32),
                mimeType: "image/png" as const,
            })),
        );
    } finally {
        bitmap.close();
    }
}

async function loadWokaPoseLayer(url: string): Promise<ImageBitmap> {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new AssetGenerationError("invalid_request", "The Woka pose guide could not be loaded.");
    return createImageBitmap(await response.blob());
}

async function composeWokaPoseSheet(layers: readonly ImageBitmap[]): Promise<ImageBitmap> {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context === null) throw new AssetGenerationError("invalid_request", "The Woka pose guide is invalid.");
    try {
        for (const layer of layers) context.drawImage(layer, 0, 0);
        return await createImageBitmap(canvas);
    } finally {
        for (const layer of layers) layer.close();
    }
}

async function cropFrame(bitmap: ImageBitmap, x: number, y: number): Promise<Blob> {
    const canvas = document.createElement("canvas");
    // Models receive a clear, enlarged visual guide rather than a barely
    // legible 32px thumbnail. Nearest-neighbour preserves the exact bundled
    // geometry and makes the foot/arm positions unambiguous.
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context === null) throw new AssetGenerationError("invalid_request", "The Woka pose guide is invalid.");
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, x, y, 32, 32, 0, 0, canvas.width, canvas.height);
    return canvasToPng(canvas);
}

export async function assembleWokaSpriteSheet(
    frames: readonly Blob[],
    frameSize: WokaFrameSize = { width: 32, height: 32 },
): Promise<Blob> {
    if (frames.length !== WOKA_DIRECTIONAL_FRAMES.length) {
        throw new AssetGenerationError("invalid_request", "All 12 avatar frames are required.");
    }
    const normalized = await Promise.all(
        frames.map((frame) =>
            normalizeGeneratedRaster(
                frame,
                { ...frameSize, pixelated: frameSize.width <= 32 && frameSize.height <= 32 },
                {
                    removeOpaqueEdgeBackground: true,
                },
            ),
        ),
    );
    const bitmaps = await Promise.all(normalized.map((frame) => createImageBitmap(frame)));
    try {
        const canvas = document.createElement("canvas");
        canvas.width = frameSize.width * 3;
        canvas.height = frameSize.height * 4;
        const context = canvas.getContext("2d");
        if (context === null) throw new AssetGenerationError("invalid_request", "The avatar sheet cannot be built.");
        context.imageSmoothingEnabled = frameSize.width > 32 || frameSize.height > 32;
        for (const [index, bitmap] of bitmaps.entries()) {
            const frame = WOKA_DIRECTIONAL_FRAMES[index];
            if (frame !== undefined)
                context.drawImage(bitmap, frame.column * frameSize.width, frame.row * frameSize.height);
        }
        return await canvasToPng(canvas);
    } finally {
        for (const bitmap of bitmaps) bitmap.close();
    }
}

export async function mirrorWokaFrameHorizontally(frame: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(frame);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (context === null) throw new AssetGenerationError("invalid_request", "The avatar frame cannot be mirrored.");
        context.drawImage(bitmap, 0, 0);
        const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
        mirrorRgbaPixelsHorizontally(image.data, bitmap.width, bitmap.height);
        context.putImageData(image, 0, 0);
        return await canvasToPng(canvas);
    } finally {
        bitmap.close();
    }
}

export function mirrorRgbaPixelsHorizontally(data: Uint8ClampedArray, width: number, height: number): void {
    if (width <= 0 || height <= 0 || data.length !== width * height * 4) {
        throw new AssetGenerationError("invalid_request", "The avatar frame pixels cannot be mirrored.");
    }
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < Math.floor(width / 2); x += 1) {
            const left = (y * width + x) * 4;
            const right = (y * width + (width - x - 1)) * 4;
            for (let channel = 0; channel < 4; channel += 1) {
                const value = data[left + channel];
                data[left + channel] = data[right + channel] ?? 0;
                data[right + channel] = value ?? 0;
            }
        }
    }
}

export async function splitWokaSpriteSheet(sheet: Blob): Promise<Blob[]> {
    const bitmap = await createImageBitmap(sheet);
    try {
        if (bitmap.width % 3 !== 0 || bitmap.height % 4 !== 0 || bitmap.width / 3 !== bitmap.height / 4) {
            throw new AssetGenerationError(
                "invalid_request",
                "The saved avatar does not contain a valid 3x4 frame grid.",
            );
        }
        const frameWidth = bitmap.width / 3;
        const frameHeight = bitmap.height / 4;
        return await Promise.all(
            WOKA_DIRECTIONAL_FRAMES.map(async (frame) => {
                const canvas = document.createElement("canvas");
                canvas.width = frameWidth;
                canvas.height = frameHeight;
                const context = canvas.getContext("2d");
                if (context === null) {
                    throw new AssetGenerationError("invalid_request", "The saved avatar frames cannot be opened.");
                }
                context.drawImage(
                    bitmap,
                    frame.column * frameWidth,
                    frame.row * frameHeight,
                    frameWidth,
                    frameHeight,
                    0,
                    0,
                    frameWidth,
                    frameHeight,
                );
                return canvasToPng(canvas);
            }),
        );
    } finally {
        bitmap.close();
    }
}

export async function largestSquareFrameSize(blobs: readonly Blob[]): Promise<WokaFrameSize> {
    if (blobs.length === 0) throw new AssetGenerationError("invalid_request", "At least one avatar image is required.");
    const bitmaps = await Promise.all(blobs.map((blob) => createImageBitmap(blob)));
    try {
        const size = Math.max(...bitmaps.flatMap((bitmap) => [bitmap.width, bitmap.height]));
        if (!Number.isSafeInteger(size) || size <= 0) {
            throw new AssetGenerationError("invalid_request", "The avatar source resolution is invalid.");
        }
        return { width: size, height: size };
    } finally {
        for (const bitmap of bitmaps) bitmap.close();
    }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob === null) {
                reject(new AssetGenerationError("invalid_request", "The avatar image could not be encoded."));
                return;
            }
            resolve(blob);
        }, "image/png");
    });
}
