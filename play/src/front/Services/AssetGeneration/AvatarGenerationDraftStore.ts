import { copyToArrayBuffer, decodeBase64 } from "./Base64";

const DATABASE_NAME = "teapot-avatar-generation";
const OBJECT_STORE_NAME = "drafts";
const DRAFT_RECORD_ID = "active";
const LEGACY_STORAGE_KEY = "teapot-avatar-generation-draft-v1";
const FRAME_COUNT = 12;

export type AvatarGenerationStyle = "voxel" | "ghibli" | "cartoon" | "custom";

export interface AvatarGenerationDraft {
    description: string;
    style: AvatarGenerationStyle;
    customStyle: string;
    designBlob: Blob;
    directionFrames: Array<Blob | null>;
    finalBlob: Blob | null;
    updatedAt: string;
}

export interface ArchivedAvatarGenerationDraft extends AvatarGenerationDraft {
    assetId: string;
}

interface StoredAvatarGenerationDraft extends AvatarGenerationDraft {
    id: string;
    version: 2;
}

interface LegacyStoredBlob {
    mediaType: string;
    base64: string;
}

interface LegacyStoredDraft {
    version: 1;
    description: string;
    style: AvatarGenerationStyle;
    customStyle: string;
    design: LegacyStoredBlob;
    directionFrames: Array<LegacyStoredBlob | null>;
    final: LegacyStoredBlob | null;
    updatedAt: string;
}

export interface AvatarGenerationDraftStorage {
    load(): Promise<unknown>;
    list(): Promise<unknown[]>;
    save(record: StoredAvatarGenerationDraft): Promise<void>;
    delete(): Promise<void>;
}

export class AvatarGenerationDraftStore {
    public constructor(
        private readonly storage: AvatarGenerationDraftStorage,
        private readonly legacyStorage: Storage | null = typeof localStorage === "undefined" ? null : localStorage,
    ) {}

    public async save(draft: Omit<AvatarGenerationDraft, "updatedAt">): Promise<void> {
        await this.storage.save({
            id: DRAFT_RECORD_ID,
            version: 2,
            ...draft,
            directionFrames: normalizeFrames(draft.directionFrames),
            updatedAt: new Date().toISOString(),
        });
    }

    public async load(): Promise<AvatarGenerationDraft | null> {
        const value = await this.storage.load();
        if (isStoredDraft(value)) return toDraft(value);

        const legacy = this.loadLegacyDraft();
        if (legacy === null) return null;
        await this.save({
            description: legacy.description,
            style: legacy.style,
            customStyle: legacy.customStyle,
            designBlob: legacy.designBlob,
            directionFrames: legacy.directionFrames,
            finalBlob: legacy.finalBlob,
        });
        this.legacyStorage?.removeItem(LEGACY_STORAGE_KEY);
        return legacy;
    }

    public async clear(): Promise<void> {
        await this.storage.delete();
        this.legacyStorage?.removeItem(LEGACY_STORAGE_KEY);
    }

    /** Completed drafts are an intentional local archive, not disposable progress. */
    public async listArchived(): Promise<ArchivedAvatarGenerationDraft[]> {
        const records = await this.storage.list();
        return records.flatMap((record) => {
            if (!isStoredDraft(record) || !record.id.startsWith("completed:") || record.finalBlob === null) return [];
            return [
                {
                    ...toDraft(record),
                    assetId: record.id.slice("completed:".length),
                },
            ];
        });
    }

    public async archive(assetId: string): Promise<void> {
        const value = await this.storage.load();
        if (!isStoredDraft(value)) return;
        await this.storage.save({ ...value, id: `completed:${assetId}` });
        await this.storage.delete();
        this.legacyStorage?.removeItem(LEGACY_STORAGE_KEY);
    }

    private loadLegacyDraft(): AvatarGenerationDraft | null {
        try {
            const raw = this.legacyStorage?.getItem(LEGACY_STORAGE_KEY);
            if (raw == null) return null;
            const stored: unknown = JSON.parse(raw);
            if (!isLegacyStoredDraft(stored)) return null;
            return {
                description: stored.description,
                style: stored.style,
                customStyle: stored.customStyle,
                designBlob: decodeLegacyBlob(stored.design),
                directionFrames: stored.directionFrames.map((frame) => (frame ? decodeLegacyBlob(frame) : null)),
                finalBlob: stored.final ? decodeLegacyBlob(stored.final) : null,
                updatedAt: stored.updatedAt,
            };
        } catch {
            return null;
        }
    }
}

class IndexedDbAvatarGenerationDraftStorage implements AvatarGenerationDraftStorage {
    public constructor(private readonly indexedDb: IDBFactory = indexedDB) {}

    public async load(): Promise<unknown> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readonly");
            return await requestResult(transaction.objectStore(OBJECT_STORE_NAME).get(DRAFT_RECORD_ID));
        } finally {
            database.close();
        }
    }

    public async list(): Promise<unknown[]> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readonly");
            return await requestResult(transaction.objectStore(OBJECT_STORE_NAME).getAll());
        } finally {
            database.close();
        }
    }

    public async save(record: StoredAvatarGenerationDraft): Promise<void> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
            transaction.objectStore(OBJECT_STORE_NAME).put(record);
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    public async delete(): Promise<void> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
            transaction.objectStore(OBJECT_STORE_NAME).delete(DRAFT_RECORD_ID);
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    private openDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = this.indexedDb.open(DATABASE_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                    request.result.createObjectStore(OBJECT_STORE_NAME, { keyPath: "id" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("Avatar progress storage could not be opened."));
        });
    }
}

let defaultStore: AvatarGenerationDraftStore | undefined;

export function saveAvatarGenerationDraft(draft: Omit<AvatarGenerationDraft, "updatedAt">): Promise<void> {
    return getDefaultStore().save(draft);
}

export function loadAvatarGenerationDraft(): Promise<AvatarGenerationDraft | null> {
    return getDefaultStore().load();
}

export function clearAvatarGenerationDraft(): Promise<void> {
    return getDefaultStore().clear();
}

export function archiveAvatarGenerationDraft(assetId: string): Promise<void> {
    return getDefaultStore().archive(assetId);
}

export function loadArchivedAvatarGenerationDrafts(): Promise<ArchivedAvatarGenerationDraft[]> {
    return getDefaultStore().listArchived();
}

function getDefaultStore(): AvatarGenerationDraftStore {
    defaultStore ??= new AvatarGenerationDraftStore(new IndexedDbAvatarGenerationDraftStorage());
    return defaultStore;
}

function normalizeFrames(frames: Array<Blob | null>): Array<Blob | null> {
    return Array.from({ length: FRAME_COUNT }, (_, index) => frames[index] ?? null);
}

function toDraft(stored: StoredAvatarGenerationDraft): AvatarGenerationDraft {
    return {
        description: stored.description,
        style: stored.style,
        customStyle: stored.customStyle,
        designBlob: stored.designBlob,
        directionFrames: normalizeFrames(stored.directionFrames),
        finalBlob: stored.finalBlob,
        updatedAt: stored.updatedAt,
    };
}

function isStoredDraft(value: unknown): value is StoredAvatarGenerationDraft {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === "string" &&
        value.version === 2 &&
        typeof value.description === "string" &&
        isStyle(value.style) &&
        typeof value.customStyle === "string" &&
        value.designBlob instanceof Blob &&
        Array.isArray(value.directionFrames) &&
        value.directionFrames.length === FRAME_COUNT &&
        value.directionFrames.every((frame) => frame === null || frame instanceof Blob) &&
        (value.finalBlob === null || value.finalBlob instanceof Blob) &&
        typeof value.updatedAt === "string"
    );
}

function isLegacyStoredDraft(value: unknown): value is LegacyStoredDraft {
    if (!isRecord(value)) return false;
    return (
        value.version === 1 &&
        typeof value.description === "string" &&
        isStyle(value.style) &&
        typeof value.customStyle === "string" &&
        isLegacyStoredBlob(value.design) &&
        Array.isArray(value.directionFrames) &&
        value.directionFrames.length === FRAME_COUNT &&
        value.directionFrames.every((frame) => frame === null || isLegacyStoredBlob(frame)) &&
        (value.final === null || isLegacyStoredBlob(value.final)) &&
        typeof value.updatedAt === "string"
    );
}

function isLegacyStoredBlob(value: unknown): value is LegacyStoredBlob {
    return isRecord(value) && typeof value.mediaType === "string" && typeof value.base64 === "string";
}

function decodeLegacyBlob(stored: LegacyStoredBlob): Blob {
    return new Blob([copyToArrayBuffer(decodeBase64(stored.base64))], { type: stored.mediaType });
}

function isStyle(value: unknown): value is AvatarGenerationStyle {
    return value === "voxel" || value === "ghibli" || value === "cartoon" || value === "custom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Avatar progress could not be read."));
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Avatar progress could not be saved."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Avatar progress save was aborted."));
    });
}
