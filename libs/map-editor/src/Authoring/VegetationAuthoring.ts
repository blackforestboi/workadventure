import type {
    VegetationBlockedCell,
    VegetationBlockedCellReason,
    VegetationPlacementPlan,
    VegetationPlanningSpecies,
    VegetationPreset,
    VegetationRectangle,
} from "../types";

export const VEGETATION_MAX_PLACEMENTS = 500;

export interface VegetationSelectionCorners {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

export interface VegetationPlanningInput {
    preset: VegetationPreset;
    rectangle: VegetationRectangle;
    seed: string;
    species: readonly VegetationPlanningSpecies[];
    blockedCells?: readonly VegetationBlockedCell[];
    tileWidth?: number;
    tileHeight?: number;
}

export function normalizeVegetationRectangle(corners: VegetationSelectionCorners): VegetationRectangle {
    const x = Math.min(corners.startX, corners.endX);
    const y = Math.min(corners.startY, corners.endY);
    return {
        x,
        y,
        width: Math.abs(corners.endX - corners.startX) + 1,
        height: Math.abs(corners.endY - corners.startY) + 1,
    };
}

export function planVegetation(input: VegetationPlanningInput): VegetationPlacementPlan {
    const { preset, rectangle, seed } = input;
    const tileWidth = input.tileWidth ?? 32;
    const tileHeight = input.tileHeight ?? 32;
    if (!Number.isFinite(tileWidth) || tileWidth <= 0 || !Number.isFinite(tileHeight) || tileHeight <= 0) {
        throw new Error("Vegetation planning requires positive finite tile dimensions");
    }
    const speciesByReference = new Map(input.species.map((species) => [referenceKey(species.prefabRef), species]));
    for (const entry of preset.species) {
        if (!speciesByReference.has(referenceKey(entry.prefabRef))) {
            throw new Error(`Vegetation preset references unavailable species ${referenceKey(entry.prefabRef)}`);
        }
    }

    const blockedCells = new Map(
        (input.blockedCells ?? []).map((cell) => [`${cell.x}:${cell.y}`, cell.reason] as const),
    );
    const random = seededRandom(seed);
    const placements: VegetationPlacementPlan["placements"] = [];
    const skipped: VegetationPlacementPlan["skipped"] = [];
    const skippedKeys = new Set<string>();
    const occupied: Array<{ x: number; y: number }> = [];
    const recordSkip = (x: number, y: number, reason: VegetationBlockedCellReason | "footprint" | "spacing") => {
        const key = `${x}:${y}:${reason}`;
        if (skippedKeys.has(key)) return;
        skippedKeys.add(key);
        skipped.push({ x, y, reason });
    };

    const area = rectangle.width * rectangle.height;
    const densityBoost = 1 + preset.density * 0.35;
    const targetCount = Math.min(
        VEGETATION_MAX_PLACEMENTS,
        Math.max(1, Math.round(area * preset.density * densityBoost)),
    );
    const attemptLimit = Math.min(VEGETATION_MAX_PLACEMENTS * 8, Math.max(area * 2, targetCount * 6));

    for (let attempt = 0; attempt < attemptLimit && placements.length < targetCount; attempt += 1) {
        const x = rectangle.x + Math.floor(random() * rectangle.width);
        const y = rectangle.y + Math.floor(random() * rectangle.height);
        const point = {
            x: x + 0.5 + (random() - 0.5) * 0.8,
            y: y + 1 + (random() - 0.5) * 0.8,
        };
        const entry = weightedChoice(preset, random());
        const species = speciesByReference.get(referenceKey(entry.prefabRef))!;
        const footprintReason = findFootprintBlocker(x, y, species, rectangle, blockedCells);
        if (footprintReason !== undefined && species.blocking) {
            recordSkip(x, y, footprintReason);
            continue;
        }
        if (
            occupied.some(
                (occupiedPoint) =>
                    Math.hypot(occupiedPoint.x - point.x, occupiedPoint.y - point.y) < preset.minimumSpacing,
            )
        ) {
            recordSkip(x, y, "spacing");
            continue;
        }

        const id = stableHash(
            `${seed}\0${preset.id}\0${preset.revision}\0${attempt}\0${point.x}\0${point.y}\0${referenceKey(entry.prefabRef)}`,
        );
        const width = species.displayWidthInTiles * tileWidth;
        const height = species.displayHeightInTiles * tileHeight;
        placements.push({
            id: `vegetation-${id}`,
            prefabRef: entry.prefabRef,
            x: point.x * tileWidth - width / 2,
            y: point.y * tileHeight - height,
            width,
            height,
        });
        occupied.push(point);
    }

    const core = {
        version: 1 as const,
        presetId: preset.id,
        presetRevision: preset.revision,
        seed,
        rectangle,
        placements,
        skipped,
    };
    return { ...core, digest: createVegetationPlanDigest(core) };
}

export function createVegetationPlanDigest(plan: Omit<VegetationPlacementPlan, "digest">): string {
    return stableHash(canonicalStringify(plan));
}

export function assertVegetationPlacementPlanDigest(plan: VegetationPlacementPlan): void {
    const { digest, ...content } = plan;
    if (createVegetationPlanDigest(content) !== digest) {
        throw new Error("Vegetation placement plan digest does not match its resolved records");
    }
}

function weightedChoice(preset: VegetationPreset, value: number): VegetationPreset["species"][number] {
    const total = preset.species.reduce(
        (sum: number, entry: VegetationPreset["species"][number]) => sum + entry.weight,
        0,
    );
    let cursor = value * total;
    for (const entry of preset.species) {
        cursor -= entry.weight;
        if (cursor < 0) return entry;
    }
    return preset.species[preset.species.length - 1];
}

function findFootprintBlocker(
    x: number,
    y: number,
    species: VegetationPlanningSpecies,
    rectangle: VegetationRectangle,
    blockedCells: ReadonlyMap<string, VegetationBlockedCellReason>,
): "footprint" | VegetationBlockedCellReason | undefined {
    for (let offsetY = 0; offsetY < species.footprintHeight; offsetY += 1) {
        for (let offsetX = 0; offsetX < species.footprintWidth; offsetX += 1) {
            const cellX = x + offsetX;
            const cellY = y - offsetY;
            if (
                cellX < rectangle.x ||
                cellX >= rectangle.x + rectangle.width ||
                cellY < rectangle.y ||
                cellY >= rectangle.y + rectangle.height
            ) {
                return "footprint";
            }
            const reason = blockedCells.get(`${cellX}:${cellY}`);
            if (reason !== undefined) return reason;
        }
    }
    return undefined;
}

function referenceKey(reference: { collectionName: string; id: string }): string {
    return `${reference.collectionName}:${reference.id}`;
}

function seededRandom(seed: string): () => number {
    let state = Number.parseInt(stableHash(seed).slice(0, 8), 16) >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function canonicalStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
            left.localeCompare(right),
        );
        return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalStringify(entry)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

function stableHash(value: string): string {
    let a = 0x811c9dc5;
    let b = 0x9e3779b9;
    let c = 0x85ebca6b;
    let d = 0xc2b2ae35;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        a = Math.imul(a ^ code, 0x01000193);
        b = Math.imul(b ^ code, 0x5bd1e995);
        c = Math.imul(c ^ code, 0x27d4eb2d);
        d = Math.imul(d ^ code, 0x165667b1);
    }
    return [a, b, c, d].map((part) => (part >>> 0).toString(16).padStart(8, "0")).join("");
}
