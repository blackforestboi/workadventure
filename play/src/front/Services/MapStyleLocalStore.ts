import type { TeapotMapStyleEntryView, TeapotMapStyleView } from "./TeapotMapStyleApi";

const STORAGE_KEY = "teapot-map-style-cache-v1";
const RECORD_VERSION = 1;

export interface MapStylePendingMutation {
    key: string;
    type: "create" | "copy";
    payload: { name: string } | { styleId: string; sourceKey: string };
    createdAt: string;
}

export interface MapStyleLocalSnapshot {
    ownerScope: string;
    styles: TeapotMapStyleView[];
    entries: TeapotMapStyleEntryView[];
    activeStyleId?: string;
    pending: MapStylePendingMutation[];
    /** Rich editor-only snapshots. Never treated as server copy authority. */
    editorEntries?: unknown[];
    updatedAt: string;
}

interface StoredMapStyleSnapshot extends MapStyleLocalSnapshot {
    version: typeof RECORD_VERSION;
}

export interface MapStyleKeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function browserStorage(): MapStyleKeyValueStorage | undefined {
    try {
        return globalThis.localStorage;
    } catch {
        return undefined;
    }
}

export class MapStyleLocalStore {
    private readonly memory = new Map<string, StoredMapStyleSnapshot>();

    constructor(
        private readonly storage: MapStyleKeyValueStorage | undefined = browserStorage(),
        private readonly now: () => Date = () => new Date(),
    ) {}

    read(ownerScope: string): Promise<MapStyleLocalSnapshot> {
        assertScope(ownerScope);
        this.loadStorage();
        const snapshot = this.memory.get(ownerScope);
        return Promise.resolve(snapshot === undefined ? this.empty(ownerScope) : structuredClone(snapshot));
    }

    async write(
        ownerScope: string,
        patch: Partial<Omit<MapStyleLocalSnapshot, "ownerScope" | "updatedAt">>,
    ): Promise<MapStyleLocalSnapshot> {
        const current = await this.read(ownerScope);
        const next: StoredMapStyleSnapshot = {
            ...current,
            ...structuredClone(patch),
            ownerScope,
            updatedAt: this.now().toISOString(),
            version: RECORD_VERSION,
        };
        this.memory.set(ownerScope, next);
        this.flushStorage();
        return structuredClone(next);
    }

    private empty(ownerScope: string): StoredMapStyleSnapshot {
        return {
            ownerScope,
            styles: [],
            entries: [],
            pending: [],
            editorEntries: [],
            updatedAt: this.now().toISOString(),
            version: RECORD_VERSION,
        };
    }

    private loadStorage(): void {
        if (this.memory.size > 0 || this.storage === undefined) return;
        try {
            const value = this.storage.getItem(STORAGE_KEY);
            if (value === null) return;
            const parsed = JSON.parse(value) as unknown;
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return;
            for (const [scope, record] of Object.entries(parsed)) {
                if (isSnapshot(record, scope)) this.memory.set(scope, record);
            }
        } catch {
            // Corrupt cache is non-authoritative; remote hydration can repair it.
        }
    }

    private flushStorage(): void {
        if (this.storage === undefined) return;
        try {
            this.storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.memory)));
        } catch (error: unknown) {
            throw new MapStyleLocalStoreError("Map style cache could not be saved", { cause: error });
        }
    }
}

export class MapStyleLocalStoreError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "MapStyleLocalStoreError";
    }
}

function assertScope(scope: string): void {
    if (scope.length === 0 || scope.length > 256)
        throw new MapStyleLocalStoreError("A valid map style owner scope is required");
}

function isSnapshot(value: unknown, scope: string): value is StoredMapStyleSnapshot {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Partial<StoredMapStyleSnapshot>;
    return (
        record.version === RECORD_VERSION &&
        record.ownerScope === scope &&
        Array.isArray(record.styles) &&
        Array.isArray(record.entries) &&
        Array.isArray(record.pending) &&
        typeof record.updatedAt === "string"
    );
}
