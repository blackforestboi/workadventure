import { createHash } from "node:crypto";

import { ITiledMap } from "@workadventure/tiled-map-type-guard";

import {
    INTERNAL_MAP_STORAGE_URL,
    PUBLIC_MAP_STORAGE_URL,
    TEAPOT_MAP_STORAGE_WRITE_TOKEN,
} from "../enums/EnvironmentVariable";
import type { TeapotMapRevisionRecord } from "./TeapotRecords";
import { getTeapotDataServices } from "./TeapotDataRuntime";

const MAX_TMJ_BYTES = 8 * 1024 * 1024;

export interface TeapotMapPublicationResult {
    revision: TeapotMapRevisionRecord;
    mapUrl: string;
    checksum: string;
    previousRevisionUrl: string;
}

export class TeapotMapPublicationService {
    public async currentRevision(mapUrl: string): Promise<TeapotMapRevisionRecord> {
        this.resolveMapStorageTarget(mapUrl);
        return getTeapotDataServices().repository.getMapRevision(mapUrl);
    }

    public async readMap(mapUrl: string): Promise<ITiledMap> {
        const target = this.resolveMapStorageTarget(mapUrl);
        const response = await this.storageFetch(target.internalUrl, target.host, { method: "GET" });
        if (!response.ok) throw new TeapotMapPublicationError("The current map could not be read", 502);
        const parsedMap = ITiledMap.safeParse(await response.json());
        if (!parsedMap.success) throw new TeapotMapPublicationError("The current map is not valid TMJ", 502);
        this.assertSupportedProfile(parsedMap.data);
        return parsedMap.data;
    }

    public async restorePreviousRevision(input: {
        actorId: string;
        mapUrl: string;
        expectedRevision: number;
        previousRevisionUrl: string;
    }): Promise<TeapotMapPublicationResult> {
        const currentTarget = this.resolveMapStorageTarget(input.mapUrl);
        const previousTarget = this.resolveRevisionTarget(input.mapUrl, input.previousRevisionUrl);
        const response = await this.storageFetch(previousTarget.internalUrl, currentTarget.host, { method: "GET" });
        if (!response.ok) throw new TeapotMapPublicationError("The previous revision snapshot could not be read", 502);
        return this.publish({
            actorId: input.actorId,
            mapUrl: input.mapUrl,
            expectedRevision: input.expectedRevision,
            map: await response.json(),
            source: "mcp",
        });
    }

    public async publish(input: {
        actorId: string;
        mapUrl: string;
        expectedRevision: number;
        map: unknown;
        source?: "tmj" | "mcp";
    }): Promise<TeapotMapPublicationResult> {
        const parsedMap = ITiledMap.safeParse(input.map);
        if (!parsedMap.success) throw new TeapotMapPublicationError("The submitted TMJ is invalid", 400);
        this.assertSupportedProfile(parsedMap.data);
        const content = JSON.stringify(parsedMap.data);
        if (Buffer.byteLength(content) > MAX_TMJ_BYTES) {
            throw new TeapotMapPublicationError("The submitted TMJ is too large", 413);
        }
        const target = this.resolveMapStorageTarget(input.mapUrl);
        let originalForCompensation: string | undefined;
        let publishedToPrimary = false;

        let committed;
        try {
            committed = await getTeapotDataServices().mapRevisions.execute(
                {
                    actorId: input.actorId,
                    mapId: input.mapUrl,
                    expectedRevision: input.expectedRevision,
                    source: input.source ?? "tmj",
                    leaseTtlMs: 60_000,
                    requiredCapability: "map.publish",
                },
                async () => {
                    const originalResponse = await this.storageFetch(target.internalUrl, target.host, {
                        method: "GET",
                    });
                    if (!originalResponse.ok) {
                        throw new TeapotMapPublicationError(
                            "The current map could not be read before publication",
                            502,
                        );
                    }
                    const original = await originalResponse.text();
                    originalForCompensation = original;
                    const originalChecksum = digest(original);
                    const revisionPath = `/.teapot-revisions/${digest(input.mapUrl).slice(0, 24)}/revision-${input.expectedRevision}-${originalChecksum.slice(0, 16)}.tmj`;
                    const revisionInternalUrl = new URL(revisionPath, target.internalUrl).toString();
                    const revisionPublicUrl = new URL(revisionPath, target.publicUrl).toString();

                    await this.requireStorageWrite(revisionInternalUrl, target.host, original);
                    try {
                        await this.requireStorageWrite(target.internalUrl, target.host, content);
                        publishedToPrimary = true;
                        const verification = await this.storageFetch(target.internalUrl, target.host, {
                            method: "GET",
                        });
                        if (!verification.ok || digest(await verification.text()) !== digest(content)) {
                            throw new TeapotMapPublicationError("The published map could not be verified", 502);
                        }
                    } catch (error: unknown) {
                        await this.requireStorageWrite(target.internalUrl, target.host, original).catch(
                            () => undefined,
                        );
                        publishedToPrimary = false;
                        throw error;
                    }

                    return {
                        value: {
                            mapUrl: input.mapUrl,
                            checksum: digest(content),
                            previousRevisionUrl: revisionPublicUrl,
                        },
                        objectReference: revisionPublicUrl,
                    };
                },
            );
        } catch (error: unknown) {
            // The map bytes and the application revision form one logical commit. If the
            // repository commit fails after map-storage accepted the bytes, compensate by
            // restoring the exact prior map before surfacing the error.
            if (publishedToPrimary && originalForCompensation !== undefined) {
                await this.requireStorageWrite(target.internalUrl, target.host, originalForCompensation).catch(
                    () => undefined,
                );
            }
            throw error;
        }

        return { ...committed.value, revision: committed.revision };
    }

    private assertSupportedProfile(map: ITiledMap): void {
        if (map.orientation !== "orthogonal" || map.infinite === true) {
            throw new TeapotMapPublicationError("Only finite orthogonal maps can be published", 400);
        }
        if (map.tilesets.some((tileset) => "source" in tileset || !("image" in tileset))) {
            throw new TeapotMapPublicationError("Every tileset must be embedded and use one raster image", 400);
        }
    }

    private resolveMapStorageTarget(mapUrl: string): {
        publicUrl: string;
        internalUrl: string;
        host: string;
    } {
        if (!PUBLIC_MAP_STORAGE_URL || !INTERNAL_MAP_STORAGE_URL) {
            throw new TeapotMapPublicationError("Map storage is not configured", 503);
        }
        const configuredPublic = new URL(PUBLIC_MAP_STORAGE_URL);
        const candidate = new URL(mapUrl);
        if (
            candidate.origin !== configuredPublic.origin ||
            !candidate.pathname.endsWith(".tmj") ||
            candidate.pathname.includes("..")
        ) {
            throw new TeapotMapPublicationError("The map URL is outside the configured map-storage origin", 400);
        }
        const internal = new URL(INTERNAL_MAP_STORAGE_URL);
        internal.pathname = candidate.pathname;
        internal.search = "";
        internal.hash = "";
        return { publicUrl: configuredPublic.toString(), internalUrl: internal.toString(), host: candidate.host };
    }

    private resolveRevisionTarget(
        mapUrl: string,
        previousRevisionUrl: string,
    ): { internalUrl: string; publicUrl: string } {
        const current = this.resolveMapStorageTarget(mapUrl);
        const candidate = new URL(previousRevisionUrl);
        const publicBase = new URL(current.publicUrl);
        const requiredPrefix = `/.teapot-revisions/${digest(mapUrl).slice(0, 24)}/`;
        if (
            candidate.origin !== publicBase.origin ||
            !candidate.pathname.startsWith(requiredPrefix) ||
            !/^revision-[0-9]+-[a-f0-9]{16}\.tmj$/.test(candidate.pathname.slice(requiredPrefix.length))
        ) {
            throw new TeapotMapPublicationError("The previous revision URL is not a snapshot of this map", 400);
        }
        const internal = new URL(current.internalUrl);
        internal.pathname = candidate.pathname;
        internal.search = "";
        internal.hash = "";
        return { internalUrl: internal.toString(), publicUrl: candidate.toString() };
    }

    private storageFetch(url: string, host: string, init: RequestInit): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.set("X-Forwarded-Host", host);
        if (TEAPOT_MAP_STORAGE_WRITE_TOKEN) headers.set("Authorization", `Bearer ${TEAPOT_MAP_STORAGE_WRITE_TOKEN}`);
        return fetch(url, { ...init, headers, cache: "no-store" });
    }

    private async requireStorageWrite(url: string, host: string, content: string): Promise<void> {
        const response = await this.storageFetch(url, host, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: content,
        });
        if (!response.ok) {
            throw new TeapotMapPublicationError(`Map storage rejected the publication (${response.status})`, 502);
        }
    }
}

export class TeapotMapPublicationError extends Error {
    public constructor(
        message: string,
        readonly statusCode: number,
    ) {
        super(message);
        this.name = "TeapotMapPublicationError";
    }
}

function digest(content: string): string {
    return createHash("sha256").update(content).digest("hex");
}

export const teapotMapPublicationService = new TeapotMapPublicationService();
