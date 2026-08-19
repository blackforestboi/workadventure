import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import { asError } from "catch-unknown";
import { z } from "zod";

import { NodeError } from "../Upload/NodeError";

export const WORLD_CHUNK_FORMAT_VERSION = 1;
export const WORLD_CHUNK_SIZE = 64;
const WORLD_CHUNK_TILE_COUNT = WORLD_CHUNK_SIZE * WORLD_CHUNK_SIZE;
const MAX_TILED_GID = 0xffffffff;

const WorldBoundsSchema = z
    .object({
        minTileX: z.number().int().safe(),
        minTileY: z.number().int().safe(),
        width: z.number().int().positive().safe(),
        height: z.number().int().positive().safe(),
    })
    .strict();

const WorldLayerSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        sourceLayerId: z.number().int().positive().safe().optional(),
    })
    .strict();

const WorldSourceSchema = z
    .object({
        format: z.literal("tmj"),
        path: z.string().min(1),
    })
    .strict();

const WorldManifestInputSchema = z
    .object({
        tileSize: z
            .object({
                width: z.number().int().positive().safe(),
                height: z.number().int().positive().safe(),
            })
            .strict(),
        bounds: WorldBoundsSchema,
        layers: z.array(WorldLayerSchema),
        source: WorldSourceSchema.optional(),
    })
    .strict()
    .superRefine((manifest, context) => {
        const layerIds = new Set<string>();
        for (const [index, layer] of manifest.layers.entries()) {
            if (layerIds.has(layer.id)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Layer id "${layer.id}" is duplicated`,
                    path: ["layers", index, "id"],
                });
            }
            layerIds.add(layer.id);
        }
    });

export const WorldManifestSchema = z
    .object({
        formatVersion: z.literal(WORLD_CHUNK_FORMAT_VERSION),
        revision: z.number().int().positive().safe(),
        worldId: z.string().min(1),
        chunkSize: z.literal(WORLD_CHUNK_SIZE),
        tileSize: z
            .object({
                width: z.number().int().positive().safe(),
                height: z.number().int().positive().safe(),
            })
            .strict(),
        bounds: WorldBoundsSchema,
        layers: z.array(WorldLayerSchema),
        source: WorldSourceSchema.optional(),
    })
    .strict()
    .superRefine((manifest, context) => {
        const layerIds = new Set<string>();
        for (const [index, layer] of manifest.layers.entries()) {
            if (layerIds.has(layer.id)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Layer id "${layer.id}" is duplicated`,
                    path: ["layers", index, "id"],
                });
            }
            layerIds.add(layer.id);
        }
    });

const WorldChunkCoordinatesSchema = z
    .object({
        x: z.number().int().safe(),
        y: z.number().int().safe(),
    })
    .strict();

const WorldChunkSpanSchema = z
    .object({
        start: z
            .number()
            .int()
            .min(0)
            .max(WORLD_CHUNK_TILE_COUNT - 1),
        gids: z.array(z.number().int().positive().max(MAX_TILED_GID)).min(1),
    })
    .strict();

const WorldChunkLayerSchema = z
    .object({
        layerId: z.string().min(1),
        spans: z.array(WorldChunkSpanSchema),
    })
    .strict()
    .superRefine((layer, context) => {
        let nextAvailableIndex = 0;
        for (const [index, span] of layer.spans.entries()) {
            if (span.start < nextAvailableIndex) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Tile spans must be sorted and must not overlap",
                    path: ["spans", index, "start"],
                });
            }

            const spanEnd = span.start + span.gids.length;
            if (spanEnd > WORLD_CHUNK_TILE_COUNT) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Tile span exceeds the ${WORLD_CHUNK_SIZE}x${WORLD_CHUNK_SIZE} chunk`,
                    path: ["spans", index, "gids"],
                });
            }
            nextAvailableIndex = spanEnd;
        }
    });

const WorldChunkInputSchema = z
    .object({
        layers: z.array(WorldChunkLayerSchema),
    })
    .strict()
    .superRefine((chunk, context) => {
        const layerIds = new Set<string>();
        for (const [index, layer] of chunk.layers.entries()) {
            if (layerIds.has(layer.layerId)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Layer id "${layer.layerId}" is duplicated`,
                    path: ["layers", index, "layerId"],
                });
            }
            layerIds.add(layer.layerId);
        }
    });

export const WorldChunkSchema = z
    .object({
        formatVersion: z.literal(WORLD_CHUNK_FORMAT_VERSION),
        revision: z.number().int().positive().safe(),
        worldId: z.string().min(1),
        chunkSize: z.literal(WORLD_CHUNK_SIZE),
        coordinates: WorldChunkCoordinatesSchema,
        layers: z.array(WorldChunkLayerSchema),
    })
    .strict()
    .superRefine((chunk, context) => {
        const layerIds = new Set<string>();
        for (const [index, layer] of chunk.layers.entries()) {
            if (layerIds.has(layer.layerId)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Layer id "${layer.layerId}" is duplicated`,
                    path: ["layers", index, "layerId"],
                });
            }
            layerIds.add(layer.layerId);
        }
    });

export type WorldManifestInput = z.infer<typeof WorldManifestInputSchema>;
export type WorldManifest = z.infer<typeof WorldManifestSchema>;
export type WorldChunkCoordinates = z.infer<typeof WorldChunkCoordinatesSchema>;
export type WorldChunkInput = z.infer<typeof WorldChunkInputSchema>;
export type WorldChunk = z.infer<typeof WorldChunkSchema>;

export class WorldRevisionConflictError extends Error {
    public constructor(
        public readonly resource: string,
        public readonly expectedRevision: number,
        public readonly actualRevision: number,
    ) {
        super(
            `Revision conflict for ${resource}: expected revision ${expectedRevision}, current revision ${actualRevision}`,
        );
        this.name = new.target.name;
    }
}

export class WorldManifestNotFoundError extends Error {
    public constructor(public readonly worldId: string) {
        super(`World manifest not found for "${worldId}"`);
        this.name = new.target.name;
    }
}

export class UnknownWorldLayerError extends Error {
    public constructor(
        public readonly worldId: string,
        public readonly layerId: string,
    ) {
        super(`Chunk for world "${worldId}" references unknown layer id "${layerId}"`);
        this.name = new.target.name;
    }
}

export class CorruptWorldStorageError extends Error {
    public constructor(resource: string, options?: ErrorOptions) {
        super(`Stored ${resource} is not a valid world chunk resource`, options);
        this.name = new.target.name;
    }
}

export class WorldChunkStorageError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

/**
 * Local-disk persistence for a sparse, chunked world.
 *
 * Revision 0 represents a missing resource. Persisted manifests and chunks begin
 * at revision 1 and are updated with compare-and-swap semantics. Writes to the
 * same resource are sequenced within this process and atomically renamed into
 * place, so readers never observe partial JSON files.
 */
export class WorldChunkRepository {
    private readonly writeQueues = new Map<string, Promise<void>>();

    public constructor(private readonly baseDirectory: string) {}

    public async readManifest(worldId: string): Promise<WorldManifest | null> {
        this.assertWorldId(worldId);
        const resource = `manifest for world "${worldId}"`;
        const stored = await this.readJson(this.getManifestPath(worldId), resource);
        if (stored === null) {
            return null;
        }

        const parsed = WorldManifestSchema.safeParse(stored);
        if (!parsed.success || parsed.data.worldId !== worldId) {
            throw new CorruptWorldStorageError(resource, {
                cause: parsed.success ? new Error("Stored world id does not match its path") : parsed.error,
            });
        }
        return parsed.data;
    }

    public async writeManifest(
        worldId: string,
        expectedRevision: number,
        input: WorldManifestInput,
    ): Promise<WorldManifest> {
        this.assertWorldId(worldId);
        this.assertExpectedRevision(expectedRevision);
        const parsedInput = WorldManifestInputSchema.parse(input);
        const manifestPath = this.getManifestPath(worldId);

        return await this.withWriteLock(manifestPath, async () => {
            const current = await this.readManifest(worldId);
            const actualRevision = current?.revision ?? 0;
            this.assertMatchingRevision(`manifest for world "${worldId}"`, expectedRevision, actualRevision);

            const next = WorldManifestSchema.parse({
                ...parsedInput,
                formatVersion: WORLD_CHUNK_FORMAT_VERSION,
                revision: actualRevision + 1,
                worldId,
                chunkSize: WORLD_CHUNK_SIZE,
            });
            await this.writeJsonAtomically(manifestPath, next);
            return next;
        });
    }

    public async readChunk(worldId: string, coordinates: WorldChunkCoordinates): Promise<WorldChunk | null> {
        this.assertWorldId(worldId);
        const parsedCoordinates = WorldChunkCoordinatesSchema.parse(coordinates);
        const resource = this.describeChunk(worldId, parsedCoordinates);
        const stored = await this.readJson(this.getChunkPath(worldId, parsedCoordinates), resource);
        if (stored === null) {
            return null;
        }

        const parsed = WorldChunkSchema.safeParse(stored);
        if (
            !parsed.success ||
            parsed.data.worldId !== worldId ||
            parsed.data.coordinates.x !== parsedCoordinates.x ||
            parsed.data.coordinates.y !== parsedCoordinates.y
        ) {
            throw new CorruptWorldStorageError(resource, {
                cause: parsed.success ? new Error("Stored chunk identity does not match its path") : parsed.error,
            });
        }
        return parsed.data;
    }

    public async writeChunk(
        worldId: string,
        coordinates: WorldChunkCoordinates,
        expectedRevision: number,
        input: WorldChunkInput,
    ): Promise<WorldChunk> {
        this.assertWorldId(worldId);
        this.assertExpectedRevision(expectedRevision);
        const parsedCoordinates = WorldChunkCoordinatesSchema.parse(coordinates);
        const parsedInput = WorldChunkInputSchema.parse(input);
        const chunkPath = this.getChunkPath(worldId, parsedCoordinates);
        const resource = this.describeChunk(worldId, parsedCoordinates);

        return await this.withWriteLock(chunkPath, async () => {
            const manifest = await this.readManifest(worldId);
            if (manifest === null) {
                throw new WorldManifestNotFoundError(worldId);
            }

            const current = await this.readChunk(worldId, parsedCoordinates);
            const actualRevision = current?.revision ?? 0;
            this.assertMatchingRevision(resource, expectedRevision, actualRevision);

            const knownLayerIds = new Set(manifest.layers.map((layer) => layer.id));
            const unknownLayer = parsedInput.layers.find((layer) => !knownLayerIds.has(layer.layerId));
            if (unknownLayer !== undefined) {
                throw new UnknownWorldLayerError(worldId, unknownLayer.layerId);
            }

            const next = WorldChunkSchema.parse({
                ...parsedInput,
                formatVersion: WORLD_CHUNK_FORMAT_VERSION,
                revision: actualRevision + 1,
                worldId,
                chunkSize: WORLD_CHUNK_SIZE,
                coordinates: parsedCoordinates,
            });
            await this.writeJsonAtomically(chunkPath, next);
            return next;
        });
    }

    private getWorldDirectory(worldId: string): string {
        const directoryName = createHash("sha256").update(worldId).digest("hex");
        return path.join(this.baseDirectory, "worlds", directoryName);
    }

    private getManifestPath(worldId: string): string {
        return path.join(this.getWorldDirectory(worldId), "manifest.json");
    }

    private getChunkPath(worldId: string, coordinates: WorldChunkCoordinates): string {
        return path.join(this.getWorldDirectory(worldId), "chunks", String(coordinates.x), `${coordinates.y}.json`);
    }

    private describeChunk(worldId: string, coordinates: WorldChunkCoordinates): string {
        return `chunk (${coordinates.x}, ${coordinates.y}) for world "${worldId}"`;
    }

    private assertWorldId(worldId: string): void {
        if (worldId.length === 0) {
            throw new TypeError("World id must not be empty");
        }
    }

    private assertExpectedRevision(expectedRevision: number): void {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
            throw new TypeError("Expected revision must be a non-negative safe integer");
        }
    }

    private assertMatchingRevision(resource: string, expectedRevision: number, actualRevision: number): void {
        if (expectedRevision !== actualRevision) {
            throw new WorldRevisionConflictError(resource, expectedRevision, actualRevision);
        }
    }

    private async readJson(filePath: string, resource: string): Promise<unknown | null> {
        let content: string;
        try {
            content = await readFile(filePath, "utf8");
        } catch (error: unknown) {
            const nodeError = NodeError.safeParse(error);
            if (nodeError.success && nodeError.data.code === "ENOENT") {
                return null;
            }
            throw new WorldChunkStorageError(`Could not read ${resource}`, { cause: asError(error) });
        }

        try {
            const parsed: unknown = JSON.parse(content);
            return parsed;
        } catch (error: unknown) {
            throw new CorruptWorldStorageError(resource, { cause: asError(error) });
        }
    }

    private async writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
        const directory = path.dirname(filePath);
        const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
        try {
            await mkdir(directory, { recursive: true });
            const handle = await open(temporaryPath, "wx");
            try {
                await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
                await handle.sync();
            } finally {
                await handle.close();
            }
            await rename(temporaryPath, filePath);
        } catch (error: unknown) {
            // The authoritative target is untouched until rename succeeds. Cleanup is best-effort.
            await rm(temporaryPath, { force: true }).catch(() => undefined);
            throw new WorldChunkStorageError(`Could not atomically write "${filePath}"`, { cause: asError(error) });
        }
    }

    private async withWriteLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.writeQueues.get(key) ?? Promise.resolve();
        let release = (): void => undefined;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        const queued = previous.then(() => current);
        this.writeQueues.set(key, queued);

        await previous;
        try {
            return await operation();
        } finally {
            release();
            if (this.writeQueues.get(key) === queued) {
                this.writeQueues.delete(key);
            }
        }
    }
}
