import { v4 as uuidv4 } from "uuid";

import type { AssetGenerationProviderId } from "./AssetGeneration/AssetGenerationTypes";
import {
    type GeneratedAssetLocalRecord,
    type GeneratedAssetLocalStore,
} from "./GeneratedAssetLocalStore";
import type { TeapotGeneratedAssetApi, TeapotGeneratedAssetView } from "./TeapotGeneratedAssetApi";

const MAX_DISPLAY_NAME_LENGTH = 80;

export interface GeneratedMapAssetCard {
    key: string;
    name: string;
    sha256: string;
    blob?: Blob;
    local?: GeneratedAssetLocalRecord;
    remote?: TeapotGeneratedAssetView;
}

export interface GeneratedMapAssetSnapshot {
    items: GeneratedMapAssetCard[];
    warning?: string;
}

export interface AcceptedGeneratedMapAsset {
    blob: Blob;
    providerId: AssetGenerationProviderId;
    modelId: string;
    prompt: string;
}

type LocalStore = Pick<GeneratedAssetLocalStore, "list" | "upsert">;
type RemoteApi = Pick<TeapotGeneratedAssetApi, "list" | "upload" | "download">;
type SnapshotListener = (snapshot: GeneratedMapAssetSnapshot) => void;

export function generatedAssetOwnerScope(authToken: string | null, userUuid: string | undefined): string {
    const uuid = userUuid?.trim() ?? "";
    return authToken !== null && authToken.length > 0 && uuid.length > 0 ? `user:${uuid}` : "anonymous";
}

export function generatedAssetDisplayName(prompt: string): string {
    const compact = prompt.replace(/\s+/g, " ").trim();
    return (compact || "Generated map object").slice(0, MAX_DISPLAY_NAME_LENGTH);
}

export async function sha256ForPng(blob: Blob): Promise<string> {
    if (blob.type !== "image/png" || blob.size === 0) throw new Error("Generated asset is not a valid PNG.");
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class GeneratedMapAssetController {
    private local: GeneratedAssetLocalRecord[] = [];
    private remote: TeapotGeneratedAssetView[] = [];
    private warning: string | undefined;

    public constructor(
        private readonly ownerScope: string,
        private readonly authenticated: boolean,
        private readonly localStore: LocalStore,
        private readonly remoteApi: RemoteApi,
        private readonly listener: SnapshotListener,
    ) {}

    public async hydrate(signal?: AbortSignal): Promise<void> {
        try {
            this.local = await this.localStore.list(this.ownerScope);
            this.emit();
        } catch (reason: unknown) {
            this.warning = errorMessage(reason, "Locally cached generated assets could not be loaded.");
            this.emit();
        }

        if (!this.authenticated || signal?.aborted) return;

        const retryPromise = Promise.allSettled(
            this.local.filter((record) => record.syncStatus !== "synced").map((record) => this.sync(record, signal)),
        );
        try {
            this.remote = await this.remoteApi.list("map-entity", signal);
            this.warning = undefined;
            this.emit();
        } catch (reason: unknown) {
            if (isAbort(reason)) return;
            this.warning = errorMessage(reason, "Your online generated assets could not be loaded; local copies remain available.");
            this.emit();
        }
        await retryPromise;
    }

    public async saveGenerated(asset: AcceptedGeneratedMapAsset, signal?: AbortSignal): Promise<GeneratedMapAssetCard> {
        const sha256 = await sha256ForPng(asset.blob);
        const record = await this.localStore.upsert(this.ownerScope, {
            clientId: uuidv4(),
            name: generatedAssetDisplayName(asset.prompt),
            png: asset.blob,
            sha256,
            provenance: { providerId: asset.providerId, modelId: asset.modelId },
            syncStatus: this.authenticated ? "pending" : "synced",
        });
        this.replaceLocal(record);
        this.emit();

        if (this.authenticated) {
            void this.sync(record, signal).catch((reason: unknown) => {
                this.warning = errorMessage(reason, "Online sync status could not be saved.");
                this.emit();
            });
        }
        return toCard(record);
    }

    public async retry(clientId: string, signal?: AbortSignal): Promise<void> {
        if (!this.authenticated) return;
        const record = this.local.find((item) => item.clientId === clientId);
        if (record === undefined) return;
        await this.sync(record, signal);
    }

    public async open(card: GeneratedMapAssetCard, signal?: AbortSignal): Promise<Blob> {
        if (card.blob !== undefined) return card.blob;
        if (card.remote === undefined) throw new Error("Saved asset is unavailable.");

        const blob = await this.remoteApi.download(card.remote, signal);
        const sha256 = await sha256ForPng(blob);
        if (sha256 !== card.remote.sha256.toLowerCase()) throw new Error("Saved asset download did not match its fingerprint.");
        const record = await this.localStore.upsert(this.ownerScope, {
            clientId: card.local?.clientId ?? `server:${card.remote.id}`,
            name: card.remote.name,
            png: blob,
            sha256,
            provenance: card.local?.provenance ?? { providerId: "server", modelId: "unknown" },
            syncStatus: "synced",
            serverAsset: card.remote,
        });
        this.replaceLocal(record);
        this.emit();
        return blob;
    }

    private async sync(record: GeneratedAssetLocalRecord, signal?: AbortSignal): Promise<void> {
        try {
            const pending = await this.localStore.upsert(this.ownerScope, {
                clientId: record.clientId,
                syncStatus: "pending",
                syncError: undefined,
            });
            this.replaceLocal(pending);
            this.emit();
            const remote = await this.remoteApi.upload(
                pending.png,
                pending.name,
                "map-entity",
                { source: "generated", ...pending.provenance },
                signal,
            );
            const updated = await this.localStore.upsert(this.ownerScope, {
                clientId: record.clientId,
                syncStatus: "synced",
                syncError: undefined,
                serverAsset: remote,
            });
            this.replaceLocal(updated);
            this.remote = [remote, ...this.remote.filter((item) => item.id !== remote.id)];
            this.emit();
        } catch (reason: unknown) {
            if (isAbort(reason)) return;
            const updated = await this.localStore.upsert(this.ownerScope, {
                clientId: record.clientId,
                syncStatus: "failed",
                syncError: errorMessage(reason, "Upload failed."),
            });
            this.replaceLocal(updated);
            this.emit();
        }
    }

    private replaceLocal(record: GeneratedAssetLocalRecord): void {
        this.local = [record, ...this.local.filter((item) => item.clientId !== record.clientId)];
    }

    private emit(): void {
        this.listener({ items: mergeGeneratedMapAssets(this.local, this.remote), warning: this.warning });
    }
}

export function mergeGeneratedMapAssets(
    local: readonly GeneratedAssetLocalRecord[],
    remote: readonly TeapotGeneratedAssetView[],
): GeneratedMapAssetCard[] {
    const unmatched = new Map(local.map((record) => [record.clientId, record]));
    const seenServerIds = new Set<string>();
    const seenFingerprints = new Set<string>();
    const cards: GeneratedMapAssetCard[] = [];
    for (const serverAsset of remote) {
        const fingerprint = serverAsset.sha256.toLowerCase();
        if (seenServerIds.has(serverAsset.id) || seenFingerprints.has(fingerprint)) continue;
        seenServerIds.add(serverAsset.id);
        seenFingerprints.add(fingerprint);
        const candidates = Array.from(unmatched.values());
        const cached =
            candidates.find((record) => record.serverAsset?.id === serverAsset.id) ??
            candidates.find((record) => record.sha256 === fingerprint);
        for (const record of candidates) {
            if (record.serverAsset?.id === serverAsset.id || record.sha256 === fingerprint) {
                unmatched.delete(record.clientId);
            }
        }
        cards.push({
            key: `server:${serverAsset.id}`,
            name: serverAsset.name,
            sha256: fingerprint,
            remote: serverAsset,
            ...(cached === undefined ? {} : { blob: cached.png, local: cached }),
        });
    }
    for (const record of unmatched.values()) {
        const serverId = record.serverAsset?.id;
        if ((serverId !== undefined && seenServerIds.has(serverId)) || seenFingerprints.has(record.sha256)) continue;
        if (serverId !== undefined) seenServerIds.add(serverId);
        seenFingerprints.add(record.sha256);
        cards.push(toCard(record));
    }
    return cards;
}

function toCard(record: GeneratedAssetLocalRecord): GeneratedMapAssetCard {
    return {
        key: `local:${record.clientId}`,
        name: record.serverAsset?.name ?? record.name,
        sha256: record.serverAsset?.sha256.toLowerCase() ?? record.sha256,
        blob: record.png,
        local: record,
        ...(record.serverAsset === undefined ? {} : { remote: record.serverAsset }),
    };
}

function errorMessage(reason: unknown, fallback: string): string {
    return reason instanceof Error && reason.message.trim().length > 0 ? reason.message : fallback;
}

function isAbort(reason: unknown): boolean {
    return reason instanceof DOMException && reason.name === "AbortError";
}
