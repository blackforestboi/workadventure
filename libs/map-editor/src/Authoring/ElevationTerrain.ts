import type { ITiledMap } from "@workadventure/tiled-map-type-guard";

export const ELEVATION_PROPERTY_NAME = "teapot:elevation/v1";
/** Canonical transport key for the map-wide height field. The layer field remains for wire compatibility. */
export const ELEVATION_WORLD_LAYER = "__teapot_world_elevation__";
export const MAX_ELEVATION = 20;
export const WIDE_ELEVATION_BRUSH_RADIUS = 2;

export type ElevationSculptDirection = 1 | -1;

export interface ElevationSculptOptions {
    direction?: ElevationSculptDirection;
    radius?: number;
}

export interface TeapotElevationUpdate {
    layer: string;
    x: number;
    y: number;
    elevation: number;
}

export interface ElevationCell {
    layer: string;
    x: number;
    y: number;
    elevation: number;
}

export type ElevationEdgeDirection = "north" | "east" | "south" | "west";

export interface ElevationCliffEdge {
    x: number;
    y: number;
    direction: ElevationEdgeDirection;
    elevation: number;
    neighborElevation: number;
}

export interface ElevationContourPoint {
    x: number;
    y: number;
}

export interface ElevationContour {
    level: number;
    points: ElevationContourPoint[];
}

export interface ElevationSurfaceVertex extends ElevationContourPoint {
    elevation: number;
    u: number;
    v: number;
}

export interface ElevationSurfaceMesh {
    vertices: ElevationSurfaceVertex[];
    indices: number[];
}

export interface ElevationSurfaceBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export type ElevationSampler = (tileX: number, tileY: number) => number;

interface StoredElevationField {
    version: 1;
    cells: ElevationCell[];
}

/** Reads the persisted sparse elevation field. Invalid historic data is ignored instead of breaking map loading. */
export function getElevationCells(map: ITiledMap, layer?: string): ElevationCell[] {
    const property = map.properties?.find((candidate) => candidate.name === ELEVATION_PROPERTY_NAME);
    if (property?.type !== "string" || typeof property.value !== "string") return [];
    try {
        const stored = JSON.parse(property.value) as Partial<StoredElevationField>;
        if (stored.version !== 1 || !Array.isArray(stored.cells)) return [];
        return stored.cells
            .filter(isValidElevationCell)
            .filter((cell) => layer === undefined || cell.layer === layer)
            .sort(compareElevationCells);
    } catch {
        return [];
    }
}

export function getElevationAt(map: ITiledMap, layer: string, x: number, y: number): number {
    return getElevationCellsForSurface(map, layer).find((cell) => cell.x === x && cell.y === y)?.elevation ?? 0;
}

/** Builds a cached sampler for the one map-wide height field, including legacy layer data. */
export function createElevationSampler(map: ITiledMap, layers?: ReadonlySet<string>): ElevationSampler {
    const fields = new Map<string, Map<string, number>>();
    const cells =
        layers === undefined || layers.has(ELEVATION_WORLD_LAYER)
            ? getElevationCellsForSurface(map, ELEVATION_WORLD_LAYER)
            : getElevationCells(map);
    for (const cell of cells) {
        if (layers !== undefined && !layers.has(cell.layer)) continue;
        let field = fields.get(cell.layer);
        if (field === undefined) {
            field = new Map<string, number>();
            fields.set(cell.layer, field);
        }
        field.set(coordinateKey(cell.x, cell.y), cell.elevation);
    }
    return (tileX, tileY) => {
        let maximum = 0;
        for (const field of fields.values()) {
            maximum = Math.max(maximum, sampleElevationSurface(field, tileX, tileY));
        }
        return maximum;
    };
}

/** Returns the smallest tile-space rectangle that contains the requested logical surface. */
export function getElevationSurfaceBounds(map: ITiledMap, layer: string): ElevationSurfaceBounds | undefined {
    const cells = getElevationCellsForSurface(map, layer);
    if (cells.length === 0) return undefined;
    return {
        minX: Math.min(...cells.map((cell) => cell.x)) - 0.5,
        minY: Math.min(...cells.map((cell) => cell.y)) - 0.5,
        maxX: Math.max(...cells.map((cell) => cell.x)) + 1.5,
        maxY: Math.max(...cells.map((cell) => cell.y)) + 1.5,
    };
}

export function applyElevationUpdates(map: ITiledMap, updates: readonly TeapotElevationUpdate[]): ITiledMap {
    if (updates.length === 0) return structuredClone(map);
    const next = structuredClone(map);
    const migrateToWorldSurface = updates.some((update) => update.layer === ELEVATION_WORLD_LAYER);
    const existingCells = migrateToWorldSurface
        ? getElevationCellsForSurface(next, ELEVATION_WORLD_LAYER)
        : getElevationCells(next);
    const cells = new Map(existingCells.map((cell) => [elevationKey(cell.layer, cell.x, cell.y), cell]));
    for (const update of updates) {
        assertElevationUpdate(update);
        const normalizedUpdate = migrateToWorldSurface ? { ...update, layer: ELEVATION_WORLD_LAYER } : update;
        const key = elevationKey(normalizedUpdate.layer, normalizedUpdate.x, normalizedUpdate.y);
        if (update.elevation === 0) cells.delete(key);
        else cells.set(key, normalizedUpdate);
    }
    const serialized = JSON.stringify({
        version: 1,
        cells: [...cells.values()].sort(compareElevationCells),
    } satisfies StoredElevationField);
    const properties = next.properties ?? [];
    const propertyIndex = properties.findIndex((property) => property.name === ELEVATION_PROPERTY_NAME);
    if (cells.size === 0) {
        if (propertyIndex !== -1) properties.splice(propertyIndex, 1);
    } else if (propertyIndex === -1) {
        properties.push({ name: ELEVATION_PROPERTY_NAME, type: "string", value: serialized });
    } else {
        properties[propertyIndex] = { ...properties[propertyIndex], type: "string", value: serialized };
    }
    next.properties = properties;
    return next;
}

export function incrementElevation(
    map: ITiledMap,
    layer: string,
    x: number,
    y: number,
): TeapotElevationUpdate | undefined {
    const elevation = getElevationAt(map, layer, x, y);
    return elevation >= MAX_ELEVATION ? undefined : { layer, x, y, elevation: elevation + 1 };
}

/**
 * Raises or lowers a plateau and propagates the change into a one-step-per-cell slope.
 * This keeps authored terrain walkable-looking instead of producing isolated vertical columns.
 */
export function sculptElevation(
    map: ITiledMap,
    layer: string,
    centerX: number,
    centerY: number,
    options: ElevationSculptOptions = {},
): TeapotElevationUpdate[] {
    const direction = options.direction ?? 1;
    const radius = options.radius ?? 0;
    if ((direction !== 1 && direction !== -1) || !Number.isInteger(radius) || radius < 0) {
        throw new Error("Elevation sculpt direction and radius are invalid.");
    }

    const original = new Map(
        getElevationCellsForSurface(map, layer).map((cell) => [coordinateKey(cell.x, cell.y), cell.elevation]),
    );
    const elevations = new Map(original);
    const queue: { x: number; y: number }[] = [];

    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
        for (let x = centerX - radius; x <= centerX + radius; x += 1) {
            const key = coordinateKey(x, y);
            const current = elevations.get(key) ?? 0;
            const next = Math.max(0, Math.min(MAX_ELEVATION, current + direction));
            if (next === current) continue;
            setElevation(elevations, key, next);
            queue.push({ x, y });
        }
    }

    const neighbors = [-1, 0, 1].flatMap((y) => [-1, 0, 1].filter((x) => x !== 0 || y !== 0).map((x) => ({ x, y })));
    for (let index = 0; index < queue.length; index += 1) {
        const cell = queue[index];
        const elevation = elevations.get(coordinateKey(cell.x, cell.y)) ?? 0;
        for (const offset of neighbors) {
            const x = cell.x + offset.x;
            const y = cell.y + offset.y;
            const key = coordinateKey(x, y);
            const neighborElevation = elevations.get(key) ?? 0;
            const next =
                direction === 1
                    ? Math.max(neighborElevation, elevation - 1)
                    : Math.min(neighborElevation, elevation + 1);
            if (next === neighborElevation) continue;
            setElevation(elevations, key, next);
            queue.push({ x, y });
        }
    }

    const changedKeys = new Set([...original.keys(), ...elevations.keys()]);
    return [...changedKeys]
        .flatMap((key) => {
            const [x, y] = parseCoordinateKey(key);
            const elevation = elevations.get(key) ?? 0;
            return elevation === (original.get(key) ?? 0) ? [] : [{ layer, x, y, elevation }];
        })
        .sort(compareElevationCells);
}

/** Returns the height differences that must render as a visible cliff face. */
export function getElevationCliffEdges(map: ITiledMap, layer: string): ElevationCliffEdge[] {
    const cells = getElevationCellsForSurface(map, layer);
    const elevations = new Map(cells.map((cell) => [elevationKey(layer, cell.x, cell.y), cell.elevation]));
    const directions: readonly { direction: ElevationEdgeDirection; x: number; y: number }[] = [
        { direction: "north", x: 0, y: -1 },
        { direction: "east", x: 1, y: 0 },
        { direction: "south", x: 0, y: 1 },
        { direction: "west", x: -1, y: 0 },
    ];
    return cells.flatMap((cell) =>
        directions.flatMap(({ direction, x, y }) => {
            const neighborElevation = elevations.get(elevationKey(layer, cell.x + x, cell.y + y)) ?? 0;
            return neighborElevation < cell.elevation
                ? [{ x: cell.x, y: cell.y, direction, elevation: cell.elevation, neighborElevation }]
                : [];
        }),
    );
}

/**
 * Builds a smooth closed contour for every connected island in every elevation band.
 * Coordinates are expressed in tile units so the renderer can scale them to any map tile size.
 */
export function getElevationContours(map: ITiledMap, layer: string): ElevationContour[] {
    const cells = getElevationCellsForSurface(map, layer);
    const maximum = Math.max(0, ...cells.map((cell) => cell.elevation));
    const contours: ElevationContour[] = [];

    for (let level = 1; level <= maximum; level += 1) {
        const active = new Set(
            cells.filter((cell) => cell.elevation >= level).map((cell) => coordinateKey(cell.x, cell.y)),
        );
        for (const component of collectElevationComponents(active)) {
            for (const loop of traceElevationBoundary(component)) {
                contours.push({ level, points: smoothElevationLoop(loop) });
            }
        }
    }

    return contours.sort(
        (left, right) =>
            left.level - right.level ||
            Math.min(...left.points.map((point) => point.y)) - Math.min(...right.points.map((point) => point.y)) ||
            Math.min(...left.points.map((point) => point.x)) - Math.min(...right.points.map((point) => point.x)),
    );
}

/**
 * Samples the cell-center height field into a continuous subdivided surface.
 * Smoothstep interpolation makes adjacent patches meet with a flat tangent at canonical cell centers.
 */
export function getElevationSurfaceMesh(
    map: ITiledMap,
    layer: string,
    subdivisions = 4,
    replacementBounds?: ElevationSurfaceBounds,
): ElevationSurfaceMesh {
    if (!Number.isInteger(subdivisions) || subdivisions < 1 || subdivisions > 16) {
        throw new Error("Elevation surface subdivisions must be an integer between 1 and 16.");
    }
    const cells = getElevationCellsForSurface(map, layer);
    if (cells.length === 0) return { vertices: [], indices: [] };

    const elevations = new Map(cells.map((cell) => [coordinateKey(cell.x, cell.y), cell.elevation]));
    const bounds = replacementBounds ?? getElevationSurfaceBounds(map, layer)!;
    const { minX, minY, maxX, maxY } = bounds;
    const columns = Math.round((maxX - minX) * subdivisions) + 1;
    const rows = Math.round((maxY - minY) * subdivisions) + 1;
    const vertices: ElevationSurfaceVertex[] = [];

    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const x = minX + column / subdivisions;
            const y = minY + row / subdivisions;
            vertices.push({
                x,
                y,
                elevation: sampleElevationSurface(elevations, x, y),
                u: column / (columns - 1),
                v: row / (rows - 1),
            });
        }
    }

    const indices: number[] = [];
    for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
            const topLeft = row * columns + column;
            const topRight = topLeft + 1;
            const bottomLeft = topLeft + columns;
            const bottomRight = bottomLeft + 1;
            if (
                replacementBounds === undefined &&
                Math.max(
                    vertices[topLeft].elevation,
                    vertices[topRight].elevation,
                    vertices[bottomLeft].elevation,
                    vertices[bottomRight].elevation,
                ) <= 0
            ) {
                continue;
            }
            indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
        }
    }
    return { vertices, indices };
}

function isValidElevationCell(value: unknown): value is ElevationCell {
    if (typeof value !== "object" || value === null) return false;
    const cell = value as Partial<ElevationCell>;
    const elevation = cell.elevation;
    return (
        typeof cell.layer === "string" &&
        Number.isInteger(cell.x) &&
        Number.isInteger(cell.y) &&
        typeof elevation === "number" &&
        Number.isInteger(elevation) &&
        elevation > 0 &&
        elevation <= MAX_ELEVATION
    );
}

/**
 * Reads one logical surface. The canonical world surface also absorbs legacy per-layer cells,
 * keeping the highest historic value at each coordinate until the next update persists it globally.
 */
function getElevationCellsForSurface(map: ITiledMap, layer: string): ElevationCell[] {
    if (layer !== ELEVATION_WORLD_LAYER) return getElevationCells(map, layer);
    const merged = new Map<string, ElevationCell>();
    for (const cell of getElevationCells(map)) {
        const key = coordinateKey(cell.x, cell.y);
        const previous = merged.get(key);
        if (previous !== undefined && previous.elevation >= cell.elevation) continue;
        merged.set(key, { layer: ELEVATION_WORLD_LAYER, x: cell.x, y: cell.y, elevation: cell.elevation });
    }
    return [...merged.values()].sort(compareElevationCells);
}

function assertElevationUpdate(update: TeapotElevationUpdate): void {
    if (!isValidElevationCoordinate(update) || update.elevation < 0 || update.elevation > MAX_ELEVATION) {
        throw new Error(`Elevation must be an integer between 0 and ${MAX_ELEVATION}.`);
    }
}

function isValidElevationCoordinate(value: TeapotElevationUpdate): boolean {
    return (
        typeof value.layer === "string" &&
        value.layer.length > 0 &&
        Number.isInteger(value.x) &&
        Number.isInteger(value.y) &&
        Number.isInteger(value.elevation)
    );
}

function elevationKey(layer: string, x: number, y: number): string {
    return `${layer}\u0000${x}\u0000${y}`;
}

function coordinateKey(x: number, y: number): string {
    return `${x},${y}`;
}

function parseCoordinateKey(key: string): [number, number] {
    const separator = key.indexOf(",");
    return [Number(key.slice(0, separator)), Number(key.slice(separator + 1))];
}

function setElevation(elevations: Map<string, number>, key: string, elevation: number): void {
    if (elevation === 0) elevations.delete(key);
    else elevations.set(key, elevation);
}

function compareElevationCells(left: ElevationCell, right: ElevationCell): number {
    return left.layer.localeCompare(right.layer) || left.y - right.y || left.x - right.x;
}

interface ElevationBoundaryEdge {
    from: ElevationContourPoint;
    to: ElevationContourPoint;
}

const CARDINAL_OFFSETS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
] as const;

function collectElevationComponents(active: ReadonlySet<string>): Set<string>[] {
    const remaining = new Set(active);
    const components: Set<string>[] = [];
    while (remaining.size > 0) {
        const first = [...remaining].sort(compareCoordinateKeys)[0];
        const component = new Set<string>();
        const queue = [first];
        remaining.delete(first);
        for (let index = 0; index < queue.length; index += 1) {
            const key = queue[index];
            component.add(key);
            const [x, y] = parseCoordinateKey(key);
            for (const offset of CARDINAL_OFFSETS) {
                const neighbor = coordinateKey(x + offset.x, y + offset.y);
                if (!remaining.delete(neighbor)) continue;
                queue.push(neighbor);
            }
        }
        components.push(component);
    }
    return components;
}

function traceElevationBoundary(component: ReadonlySet<string>): ElevationContourPoint[][] {
    const edges: ElevationBoundaryEdge[] = [];
    for (const key of [...component].sort(compareCoordinateKeys)) {
        const [x, y] = parseCoordinateKey(key);
        if (!component.has(coordinateKey(x, y - 1))) edges.push({ from: { x, y }, to: { x: x + 1, y } });
        if (!component.has(coordinateKey(x + 1, y))) edges.push({ from: { x: x + 1, y }, to: { x: x + 1, y: y + 1 } });
        if (!component.has(coordinateKey(x, y + 1))) edges.push({ from: { x: x + 1, y: y + 1 }, to: { x, y: y + 1 } });
        if (!component.has(coordinateKey(x - 1, y))) edges.push({ from: { x, y: y + 1 }, to: { x, y } });
    }

    const outgoing = new Map<string, number[]>();
    edges.forEach((edge, index) => {
        const key = coordinateKey(edge.from.x, edge.from.y);
        outgoing.set(key, [...(outgoing.get(key) ?? []), index]);
    });
    const unused = new Set(edges.map((_, index) => index));
    const loops: ElevationContourPoint[][] = [];
    while (unused.size > 0) {
        const firstEdgeIndex = [...unused].sort((left, right) => compareEdges(edges[left], edges[right]))[0];
        const firstEdge = edges[firstEdgeIndex];
        const loop: ElevationContourPoint[] = [firstEdge.from];
        let edgeIndex = firstEdgeIndex;
        while (unused.delete(edgeIndex)) {
            const edge = edges[edgeIndex];
            if (pointsEqual(edge.to, loop[0])) break;
            loop.push(edge.to);
            const candidates = (outgoing.get(coordinateKey(edge.to.x, edge.to.y)) ?? []).filter((index) =>
                unused.has(index),
            );
            if (candidates.length === 0) break;
            edgeIndex = chooseBoundaryContinuation(
                edge,
                candidates.map((index) => edges[index]),
                candidates,
            );
        }
        if (loop.length >= 4) loops.push(loop);
    }
    return loops;
}

function smoothElevationLoop(
    vertices: readonly ElevationContourPoint[],
    radius = 0.38,
    cornerSamples = 4,
): ElevationContourPoint[] {
    const points: ElevationContourPoint[] = [];
    for (let index = 0; index < vertices.length; index += 1) {
        const previous = vertices[(index - 1 + vertices.length) % vertices.length];
        const current = vertices[index];
        const next = vertices[(index + 1) % vertices.length];
        const entry = pointToward(current, previous, radius);
        const exit = pointToward(current, next, radius);
        points.push(entry);
        for (let sample = 1; sample <= cornerSamples; sample += 1) {
            const t = sample / cornerSamples;
            const inverse = 1 - t;
            points.push({
                x: inverse * inverse * entry.x + 2 * inverse * t * current.x + t * t * exit.x,
                y: inverse * inverse * entry.y + 2 * inverse * t * current.y + t * t * exit.y,
            });
        }
    }
    return points;
}

function pointToward(
    from: ElevationContourPoint,
    to: ElevationContourPoint,
    maximumDistance: number,
): ElevationContourPoint {
    const x = to.x - from.x;
    const y = to.y - from.y;
    const length = Math.hypot(x, y);
    const distance = Math.min(maximumDistance, length / 2);
    return length === 0 ? { ...from } : { x: from.x + (x / length) * distance, y: from.y + (y / length) * distance };
}

function chooseBoundaryContinuation(
    previous: ElevationBoundaryEdge,
    candidates: readonly ElevationBoundaryEdge[],
    candidateIndices: readonly number[],
): number {
    const previousDirection = edgeDirection(previous);
    const priority = [1, 0, 3, 2];
    return candidateIndices
        .map((index, offset) => ({
            index,
            turn: (edgeDirection(candidates[offset]) - previousDirection + 4) % 4,
        }))
        .sort(
            (left, right) => priority.indexOf(left.turn) - priority.indexOf(right.turn) || left.index - right.index,
        )[0].index;
}

function edgeDirection(edge: ElevationBoundaryEdge): number {
    if (edge.to.x > edge.from.x) return 0;
    if (edge.to.y > edge.from.y) return 1;
    if (edge.to.x < edge.from.x) return 2;
    return 3;
}

function compareEdges(left: ElevationBoundaryEdge, right: ElevationBoundaryEdge): number {
    return left.from.y - right.from.y || left.from.x - right.from.x || edgeDirection(left) - edgeDirection(right);
}

function compareCoordinateKeys(left: string, right: string): number {
    const [leftX, leftY] = parseCoordinateKey(left);
    const [rightX, rightY] = parseCoordinateKey(right);
    return leftY - rightY || leftX - rightX;
}

function pointsEqual(left: ElevationContourPoint, right: ElevationContourPoint): boolean {
    return left.x === right.x && left.y === right.y;
}

function sampleElevationSurface(elevations: ReadonlyMap<string, number>, x: number, y: number): number {
    const gridX = x - 0.5;
    const gridY = y - 0.5;
    const left = Math.floor(gridX);
    const top = Math.floor(gridY);
    const horizontal = smoothstep(gridX - left);
    const vertical = smoothstep(gridY - top);
    const topHeight = interpolate(
        elevations.get(coordinateKey(left, top)) ?? 0,
        elevations.get(coordinateKey(left + 1, top)) ?? 0,
        horizontal,
    );
    const bottomHeight = interpolate(
        elevations.get(coordinateKey(left, top + 1)) ?? 0,
        elevations.get(coordinateKey(left + 1, top + 1)) ?? 0,
        horizontal,
    );
    return interpolate(topHeight, bottomHeight, vertical);
}

function smoothstep(value: number): number {
    return value * value * (3 - 2 * value);
}

function interpolate(start: number, end: number, amount: number): number {
    return start + (end - start) * amount;
}
