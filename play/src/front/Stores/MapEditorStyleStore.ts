import { writable } from "svelte/store";

export const DEFAULT_MAP_STYLE_ID = "default-style";
export const BUILT_IN_MAP_STYLE_ID = "built-in";

const STYLE_STORAGE_KEY = "workadventure.map-editor.styles.v1";
const ACTIVE_STYLE_STORAGE_KEY = "workadventure.map-editor.active-style.v1";

export type MapEditorStyleKind = "default" | "built-in" | "custom";
export type MapEditorStyleAssetKind = "terrain" | "object";

export interface MapEditorStyle {
    id: string;
    name: string;
    kind: MapEditorStyleKind;
    readOnly: boolean;
    createdAt?: string;
}

export interface MapEditorStyleSource {
    type: string;
    key: string;
    version: string;
}

/**
 * Search and display fields are deliberately separate from the kind-specific snapshot. This keeps style filtering
 * generic while allowing terrain and object callers to retain every placement/rendering field they own.
 */
export interface MapEditorStyleAssetMetadata<TSnapshot = unknown> {
    name: string;
    description?: string;
    tags: readonly string[];
    keywords: readonly string[];
    category?: string;
    previewUrl?: string;
    snapshot: TSnapshot;
}

export interface MapEditorStyleEntry<TSnapshot = unknown> {
    id: string;
    styleId: string;
    assetKind: MapEditorStyleAssetKind;
    source: MapEditorStyleSource;
    metadataVersion: 1;
    metadata: MapEditorStyleAssetMetadata<TSnapshot>;
    derivedFromAssetId?: string;
    createdAt: string;
}

export interface CopyMapEditorStyleAssetInput<TSnapshot = unknown> {
    destinationStyleId: string;
    assetKind: MapEditorStyleAssetKind;
    source: MapEditorStyleSource;
    metadata: MapEditorStyleAssetMetadata<TSnapshot>;
    derivedFromAssetId?: string;
}

/**
 * Authenticated Teapot implementations can replace this adapter without coupling the editor components to HTTP.
 * The fallback is intentionally anonymous/local-only; it never merges identities or sends client metadata to a
 * server copy endpoint.
 */
export interface MapEditorStyleAdapter {
    listStyles(signal?: AbortSignal): Promise<readonly MapEditorStyle[]>;
    listEntries(signal?: AbortSignal): Promise<readonly MapEditorStyleEntry[]>;
    createStyle(name: string, signal?: AbortSignal): Promise<MapEditorStyle>;
    copyAsset<TSnapshot>(
        input: CopyMapEditorStyleAssetInput<TSnapshot>,
        signal?: AbortSignal,
    ): Promise<MapEditorStyleEntry<TSnapshot>>;
    getNotice?(): string | undefined;
}

interface StoredStyleData {
    styles: MapEditorStyle[];
    entries: MapEditorStyleEntry[];
}

export interface MapEditorStyleState {
    styles: readonly MapEditorStyle[];
    entries: readonly MapEditorStyleEntry[];
    activeStyleId: string;
    status: "idle" | "loading" | "ready" | "error";
    error?: string;
    notice?: string;
}

const DEFAULT_STYLE: MapEditorStyle = {
    id: DEFAULT_MAP_STYLE_ID,
    name: "Default style",
    kind: "default",
    readOnly: false,
};

const BUILT_IN_STYLE: MapEditorStyle = {
    id: BUILT_IN_MAP_STYLE_ID,
    name: "Built-in",
    kind: "built-in",
    readOnly: true,
};

const initialState: MapEditorStyleState = {
    styles: [DEFAULT_STYLE, BUILT_IN_STYLE],
    entries: [],
    activeStyleId: DEFAULT_MAP_STYLE_ID,
    status: "idle",
};

function browserStorage(): Storage | undefined {
    return typeof window === "undefined" ? undefined : window.localStorage;
}

function parseStoredData(storage: Storage | undefined): StoredStyleData {
    const raw = storage?.getItem(STYLE_STORAGE_KEY);
    if (raw === null || raw === undefined) return { styles: [], entries: [] };
    try {
        const parsed = JSON.parse(raw) as Partial<StoredStyleData>;
        return {
            styles: Array.isArray(parsed.styles)
                ? parsed.styles.filter((style) => style.kind === "custom" && !style.readOnly)
                : [],
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        };
    } catch {
        return { styles: [], entries: [] };
    }
}

function persistStoredData(storage: Storage | undefined, data: StoredStyleData): void {
    storage?.setItem(STYLE_STORAGE_KEY, JSON.stringify(data));
}

function clone<T>(value: T): T {
    return typeof structuredClone === "function" ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
}

function createId(): string {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `style-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeMapEditorStyleName(name: string): string {
    return name.trim().replace(/\s+/g, " ");
}

export function sortMapEditorStyles(styles: readonly MapEditorStyle[]): MapEditorStyle[] {
    const byName = (left: MapEditorStyle, right: MapEditorStyle) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id);
    return [
        ...styles.filter((style) => style.kind === "default").sort(byName),
        ...styles.filter((style) => style.kind === "built-in").sort(byName),
        ...styles.filter((style) => style.kind === "custom").sort(byName),
    ];
}

export function getStyleIdsContainingSource(
    entries: readonly MapEditorStyleEntry[],
    assetKind: MapEditorStyleAssetKind,
    source: MapEditorStyleSource,
): string[] {
    return entries
        .filter(
            (entry) =>
                entry.assetKind === assetKind &&
                entry.source.type === source.type &&
                entry.source.key === source.key &&
                entry.source.version === source.version,
        )
        .map((entry) => entry.styleId);
}

export function entryMatchesSearch(entry: MapEditorStyleEntry, search: string): boolean {
    const tokens = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const metadata = entry.metadata;
    const haystack = [metadata.name, metadata.description, metadata.category, ...metadata.tags, ...metadata.keywords]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
}

export function createLocalMapEditorStyleAdapter(
    storage: Storage | undefined = browserStorage(),
): MapEditorStyleAdapter {
    return {
        listStyles() {
            const stored = parseStoredData(storage);
            return Promise.resolve(sortMapEditorStyles([DEFAULT_STYLE, BUILT_IN_STYLE, ...stored.styles]));
        },
        listEntries() {
            return Promise.resolve(clone(parseStoredData(storage).entries));
        },
        createStyle(name) {
            return Promise.resolve().then(() => {
                const normalizedName = normalizeMapEditorStyleName(name);
                if (normalizedName.length < 1 || normalizedName.length > 80) {
                    throw new Error("Style names must be between 1 and 80 characters.");
                }
                const stored = parseStoredData(storage);
                const allStyles = [DEFAULT_STYLE, BUILT_IN_STYLE, ...stored.styles];
                if (allStyles.some((style) => style.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
                    throw new Error("A style with this name already exists.");
                }
                const style: MapEditorStyle = {
                    id: createId(),
                    name: normalizedName,
                    kind: "custom",
                    readOnly: false,
                    createdAt: new Date().toISOString(),
                };
                persistStoredData(storage, { ...stored, styles: [...stored.styles, style] });
                return clone(style);
            });
        },
        copyAsset<TSnapshot>(input: CopyMapEditorStyleAssetInput<TSnapshot>) {
            return Promise.resolve().then(() => {
                const stored = parseStoredData(storage);
                const destination = [DEFAULT_STYLE, ...stored.styles].find(
                    (style) => style.id === input.destinationStyleId && !style.readOnly,
                );
                if (destination === undefined) throw new Error("That destination style is no longer available.");
                const existing = stored.entries.find(
                    (entry) =>
                        entry.styleId === input.destinationStyleId &&
                        entry.assetKind === input.assetKind &&
                        entry.source.type === input.source.type &&
                        entry.source.key === input.source.key &&
                        entry.source.version === input.source.version,
                );
                if (existing !== undefined) return clone(existing as MapEditorStyleEntry<TSnapshot>);

                const entry: MapEditorStyleEntry<TSnapshot> = {
                    id: createId(),
                    styleId: destination.id,
                    assetKind: input.assetKind,
                    source: clone(input.source),
                    metadataVersion: 1,
                    metadata: clone(input.metadata),
                    derivedFromAssetId: input.derivedFromAssetId,
                    createdAt: new Date().toISOString(),
                };
                persistStoredData(storage, { ...stored, entries: [...stored.entries, entry] });
                return clone(entry);
            });
        },
    };
}

function createMapEditorStyleStore() {
    const { subscribe, set, update } = writable<MapEditorStyleState>(initialState);
    let adapter: MapEditorStyleAdapter = createLocalMapEditorStyleAdapter();
    let hydrationPromise: Promise<void> | undefined;
    let requestEpoch = 0;

    async function hydrate(force = false): Promise<void> {
        if (hydrationPromise !== undefined && !force) return hydrationPromise;
        const epoch = ++requestEpoch;
        update((state) => ({ ...state, status: "loading", error: undefined }));
        const controller = new AbortController();
        hydrationPromise = Promise.all([adapter.listStyles(controller.signal), adapter.listEntries(controller.signal)])
            .then(([styles, entries]) => {
                if (epoch !== requestEpoch) return;
                const sortedStyles = sortMapEditorStyles(styles);
                const savedId = browserStorage()?.getItem(ACTIVE_STYLE_STORAGE_KEY) ?? DEFAULT_MAP_STYLE_ID;
                const activeStyleId = sortedStyles.some((style) => style.id === savedId)
                    ? savedId
                    : DEFAULT_MAP_STYLE_ID;
                set({
                    styles: sortedStyles,
                    entries,
                    activeStyleId,
                    status: "ready",
                    notice:
                        adapter.getNotice?.() ??
                        (savedId !== activeStyleId
                            ? "Your previous style is unavailable. Default style is shown instead."
                            : undefined),
                });
            })
            .catch((error: unknown) => {
                if (epoch !== requestEpoch) return;
                update((state) => ({
                    ...state,
                    status: "error",
                    error: error instanceof Error ? error.message : "Styles could not be loaded.",
                }));
            })
            .finally(() => {
                if (epoch === requestEpoch) hydrationPromise = undefined;
            });
        return hydrationPromise;
    }

    function selectStyle(styleId: string): void {
        update((state) => {
            const nextId = state.styles.some((style) => style.id === styleId) ? styleId : DEFAULT_MAP_STYLE_ID;
            browserStorage()?.setItem(ACTIVE_STYLE_STORAGE_KEY, nextId);
            return {
                ...state,
                activeStyleId: nextId,
                notice: nextId === styleId ? undefined : "That style is unavailable. Default style is shown instead.",
            };
        });
    }

    async function createStyle(name: string, activate = true): Promise<MapEditorStyle> {
        const style = await adapter.createStyle(name);
        update((state) => ({
            ...state,
            styles: sortMapEditorStyles([...state.styles.filter((candidate) => candidate.id !== style.id), style]),
            activeStyleId: activate ? style.id : state.activeStyleId,
            notice: undefined,
        }));
        if (activate) browserStorage()?.setItem(ACTIVE_STYLE_STORAGE_KEY, style.id);
        return style;
    }

    async function copyAsset<TSnapshot>(
        input: CopyMapEditorStyleAssetInput<TSnapshot>,
    ): Promise<MapEditorStyleEntry<TSnapshot>> {
        const entry = await adapter.copyAsset(input);
        update((state) => ({
            ...state,
            entries: [
                ...state.entries.filter(
                    (candidate) =>
                        !(
                            candidate.styleId === entry.styleId &&
                            candidate.assetKind === entry.assetKind &&
                            candidate.source.type === entry.source.type &&
                            candidate.source.key === entry.source.key &&
                            candidate.source.version === entry.source.version
                        ),
                ),
                entry,
            ],
            notice: adapter.getNotice?.(),
        }));
        return entry;
    }

    function useAdapter(nextAdapter: MapEditorStyleAdapter): void {
        requestEpoch += 1;
        hydrationPromise = undefined;
        adapter = nextAdapter;
        set(initialState);
    }

    function clearNotice(): void {
        update((state) => ({ ...state, notice: undefined }));
    }

    return { subscribe, hydrate, selectStyle, createStyle, copyAsset, useAdapter, clearNotice };
}

export const mapEditorStyleStore = createMapEditorStyleStore();
