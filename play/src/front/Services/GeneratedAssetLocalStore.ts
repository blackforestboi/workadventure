import type { TeapotGeneratedAssetView } from "./TeapotGeneratedAssetApi";
import { VisualAssetAnimation } from "@workadventure/map-editor";

const DATABASE_NAME = "teapot-generated-map-assets";
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = "assets";
const RECORD_VERSION = 1;
const MAX_NAME_LENGTH = 80;
const DEFAULT_MAX_RECORDS = 48;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export type GeneratedAssetSyncStatus = "pending" | "failed" | "synced";

export interface GeneratedAssetProvenance {
    providerId: string;
    modelId: string;
}

export interface GeneratedAssetLocalRecord {
    clientId: string;
    ownerScope: string;
    name: string;
    png: Blob;
    sha256: string;
    provenance: GeneratedAssetProvenance;
    animation?: VisualAssetAnimation;
    syncStatus: GeneratedAssetSyncStatus;
    syncError?: string;
    serverAsset?: TeapotGeneratedAssetView;
    createdAt: string;
    updatedAt: string;
}

export type GeneratedAssetLocalUpsert = Pick<GeneratedAssetLocalRecord, "clientId"> &
    Partial<Omit<GeneratedAssetLocalRecord, "clientId" | "ownerScope" | "createdAt" | "updatedAt">>;

interface StoredGeneratedAsset extends GeneratedAssetLocalRecord {
    storageKey: string;
    version: typeof RECORD_VERSION;
}

export interface GeneratedAssetLocalStorage {
    list(): Promise<unknown[]>;
    write(record: StoredGeneratedAsset, removeStorageKeys: readonly string[]): Promise<void>;
    remove(storageKey: string): Promise<void>;
}

export interface GeneratedAssetRetentionOptions {
    maxRecords?: number;
    maxBytes?: number;
}

export class GeneratedAssetLocalStoreError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "GeneratedAssetLocalStoreError";
    }
}

export class GeneratedAssetLocalStore {
    private readonly maxRecords: number;
    private readonly maxBytes: number;

    public constructor(
        private readonly storage: GeneratedAssetLocalStorage = new IndexedDbGeneratedAssetLocalStorage(),
        retention: GeneratedAssetRetentionOptions = {},
        private readonly now: () => Date = () => new Date(),
    ) {
        this.maxRecords = normalizeLimit(retention.maxRecords, DEFAULT_MAX_RECORDS);
        this.maxBytes = normalizeLimit(retention.maxBytes, DEFAULT_MAX_BYTES);
    }

    public async list(ownerScope: string): Promise<GeneratedAssetLocalRecord[]> {
        assertOwnerScope(ownerScope);
        const records = await this.readValidRecords();
        return records
            .filter((record) => record.ownerScope === ownerScope)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .map(toLocalRecord);
    }

    public async upsert(ownerScope: string, patch: GeneratedAssetLocalUpsert): Promise<GeneratedAssetLocalRecord> {
        assertOwnerScope(ownerScope);
        assertClientId(patch.clientId);

        const records = await this.readValidRecords();
        const storageKey = makeStorageKey(ownerScope, patch.clientId);
        const existing = records.find((record) => record.storageKey === storageKey);
        const timestamp = this.now().toISOString();
        const merged: StoredGeneratedAsset = {
            ...(existing ?? {}),
            ...patch,
            storageKey,
            version: RECORD_VERSION,
            clientId: patch.clientId,
            ownerScope,
            name: normalizeName(patch.name ?? existing?.name),
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
        } as StoredGeneratedAsset;
        assertStoredRecord(merged);

        const ownerRecords = records.filter(
            (record) => record.ownerScope === ownerScope && record.storageKey !== storageKey,
        );
        ownerRecords.push(merged);
        const removeStorageKeys = selectEvictions(ownerRecords, this.maxRecords, this.maxBytes).map(
            (record) => record.storageKey,
        );

        try {
            await this.storage.write(merged, removeStorageKeys);
        } catch (error: unknown) {
            throw persistenceError("Generated asset storage could not be updated.", error);
        }
        return toLocalRecord(merged);
    }

    public async remove(ownerScope: string, clientId: string): Promise<void> {
        assertOwnerScope(ownerScope);
        assertClientId(clientId);
        try {
            await this.storage.remove(makeStorageKey(ownerScope, clientId));
        } catch (error: unknown) {
            throw persistenceError("Generated asset storage could not be updated.", error);
        }
    }

    private async readValidRecords(): Promise<StoredGeneratedAsset[]> {
        let values: unknown[];
        try {
            values = await this.storage.list();
        } catch (error: unknown) {
            throw persistenceError("Generated asset storage could not be read.", error);
        }
        return values.filter(isStoredRecord);
    }
}

export class IndexedDbGeneratedAssetLocalStorage implements GeneratedAssetLocalStorage {
    public constructor(
        private readonly indexedDb: IDBFactory = indexedDB,
        private readonly databaseName = DATABASE_NAME,
    ) {}

    public async list(): Promise<unknown[]> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readonly");
            return await requestResult(transaction.objectStore(OBJECT_STORE_NAME).getAll());
        } finally {
            database.close();
        }
    }

    public async write(record: StoredGeneratedAsset, removeStorageKeys: readonly string[]): Promise<void> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
            const objectStore = transaction.objectStore(OBJECT_STORE_NAME);
            objectStore.put(record);
            for (const storageKey of removeStorageKeys) {
                if (storageKey !== record.storageKey) objectStore.delete(storageKey);
            }
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    public async remove(storageKey: string): Promise<void> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
            transaction.objectStore(OBJECT_STORE_NAME).delete(storageKey);
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    private openDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = this.indexedDb.open(this.databaseName, DATABASE_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                    request.result.createObjectStore(OBJECT_STORE_NAME, { keyPath: "storageKey" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("Generated asset storage could not be opened."));
        });
    }
}

function selectEvictions(
    ownerRecords: readonly StoredGeneratedAsset[],
    maxRecords: number,
    maxBytes: number,
): StoredGeneratedAsset[] {
    let recordCount = ownerRecords.length;
    let byteCount = ownerRecords.reduce((total, record) => total + record.png.size, 0);
    const evictions: StoredGeneratedAsset[] = [];
    const syncedOldestFirst = ownerRecords
        .filter((record) => record.syncStatus === "synced")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    for (const candidate of syncedOldestFirst) {
        if (recordCount <= maxRecords && byteCount <= maxBytes) break;
        evictions.push(candidate);
        recordCount -= 1;
        byteCount -= candidate.png.size;
    }
    return evictions;
}

function toLocalRecord(stored: StoredGeneratedAsset): GeneratedAssetLocalRecord {
    return {
        clientId: stored.clientId,
        ownerScope: stored.ownerScope,
        name: stored.name,
        png: stored.png,
        sha256: stored.sha256.toLowerCase(),
        provenance: { ...stored.provenance },
        ...(stored.animation === undefined ? {} : { animation: structuredClone(stored.animation) }),
        syncStatus: stored.syncStatus,
        ...(stored.syncError === undefined ? {} : { syncError: stored.syncError }),
        ...(stored.serverAsset === undefined ? {} : { serverAsset: { ...stored.serverAsset } }),
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
    };
}

function isStoredRecord(value: unknown): value is StoredGeneratedAsset {
    try {
        assertStoredRecord(value);
        return true;
    } catch {
        return false;
    }
}

function assertStoredRecord(value: unknown): asserts value is StoredGeneratedAsset {
    if (!isRecord(value)) throw new Error("Invalid generated asset record.");
    if (value.version !== RECORD_VERSION) throw new Error("Unsupported generated asset record version.");
    if (typeof value.storageKey !== "string") throw new Error("Invalid generated asset storage key.");
    assertOwnerScope(value.ownerScope);
    assertClientId(value.clientId);
    if (value.storageKey !== makeStorageKey(value.ownerScope, value.clientId)) {
        throw new Error("Invalid generated asset storage key.");
    }
    if (typeof value.name !== "string" || value.name.length === 0 || value.name.length > MAX_NAME_LENGTH) {
        throw new Error("Invalid generated asset name.");
    }
    if (!isPngBlob(value.png)) {
        throw new Error("Invalid generated asset PNG.");
    }
    if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
        throw new Error("Invalid generated asset fingerprint.");
    }
    if (!isProvenance(value.provenance)) throw new Error("Invalid generated asset provenance.");
    if (value.animation !== undefined && !VisualAssetAnimation.safeParse(value.animation).success) {
        throw new Error("Invalid generated asset animation metadata.");
    }
    if (!isSyncStatus(value.syncStatus)) throw new Error("Invalid generated asset sync status.");
    if (value.syncError !== undefined && typeof value.syncError !== "string") {
        throw new Error("Invalid generated asset sync error.");
    }
    if (value.serverAsset !== undefined && !isServerAsset(value.serverAsset)) {
        throw new Error("Invalid generated asset server view.");
    }
    if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) {
        throw new Error("Invalid generated asset timestamp.");
    }
}

function isProvenance(value: unknown): value is GeneratedAssetProvenance {
    return (
        isRecord(value) &&
        typeof value.providerId === "string" &&
        value.providerId.length > 0 &&
        typeof value.modelId === "string" &&
        value.modelId.length > 0
    );
}

function isServerAsset(value: unknown): value is TeapotGeneratedAssetView {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.url === "string" &&
        (value.kind === "map-entity" || value.kind === "reference") &&
        typeof value.width === "number" &&
        Number.isInteger(value.width) &&
        value.width > 0 &&
        typeof value.height === "number" &&
        Number.isInteger(value.height) &&
        value.height > 0 &&
        typeof value.sha256 === "string" &&
        SHA256_PATTERN.test(value.sha256) &&
        typeof value.createdAt === "string" &&
        (value.animation === undefined || VisualAssetAnimation.safeParse(value.animation).success)
    );
}

function isSyncStatus(value: unknown): value is GeneratedAssetSyncStatus {
    return value === "pending" || value === "failed" || value === "synced";
}

function isTimestamp(value: unknown): value is string {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isPngBlob(value: unknown): value is Blob {
    return (
        typeof value === "object" &&
        value !== null &&
        Object.prototype.toString.call(value) === "[object Blob]" &&
        "type" in value &&
        value.type === "image/png" &&
        "size" in value &&
        typeof value.size === "number" &&
        value.size > 0 &&
        "arrayBuffer" in value &&
        typeof value.arrayBuffer === "function"
    );
}

function normalizeName(value: unknown): string {
    if (typeof value !== "string") throw new Error("A generated asset name is required.");
    const name = value.trim().slice(0, MAX_NAME_LENGTH);
    if (name.length === 0) throw new Error("A generated asset name is required.");
    return name;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("Generated asset retention limits must be non-negative integers.");
    return value;
}

function assertOwnerScope(value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > 256) {
        throw new Error("A valid generated asset owner scope is required.");
    }
}

function assertClientId(value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > 128) {
        throw new Error("A valid generated asset client ID is required.");
    }
}

function makeStorageKey(ownerScope: string, clientId: string): string {
    return `${ownerScope.length}:${ownerScope}${clientId}`;
}

function persistenceError(message: string, cause: unknown): GeneratedAssetLocalStoreError {
    return cause instanceof GeneratedAssetLocalStoreError
        ? cause
        : new GeneratedAssetLocalStoreError(message, { cause });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Generated asset storage could not be read."));
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Generated asset storage update failed."));
        transaction.onabort = () =>
            reject(transaction.error ?? new Error("Generated asset storage update was aborted."));
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
