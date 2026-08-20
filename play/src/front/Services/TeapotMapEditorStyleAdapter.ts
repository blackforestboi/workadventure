import { localUserStore } from "../Connection/LocalUserStore";
import {
    BUILT_IN_MAP_STYLE_ID,
    DEFAULT_MAP_STYLE_ID,
    createLocalMapEditorStyleAdapter,
    mapEditorStyleStore,
    type CopyMapEditorStyleAssetInput,
    type MapEditorStyle,
    type MapEditorStyleAdapter,
    type MapEditorStyleAssetKind,
    type MapEditorStyleAssetMetadata,
    type MapEditorStyleEntry,
    type MapEditorStyleSource,
} from "../Stores/MapEditorStyleStore";
import { MapStyleController, mapStyleOwnerScope, type MapStyleControllerSnapshot } from "./MapStyleController";
import { MapStyleLocalStore } from "./MapStyleLocalStore";
import {
    teapotMapStyleApi,
    type TeapotMapStyleApi,
    type TeapotMapStyleAssetKind,
    type TeapotMapStyleEntryView,
    type TeapotMapStyleSource,
    type TeapotMapStyleView,
} from "./TeapotMapStyleApi";

const LOCAL_ONLY_NOTICE =
    "This asset is saved in this browser only until its built-in or object source can be verified by the server.";
const TEAPOT_ASSET_ID = /^[A-Za-z0-9_-]{1,128}$/;

type StyleApi = Pick<TeapotMapStyleApi, "list" | "create" | "copy">;

export interface TeapotMapEditorStyleAdapterOptions {
    ownerScope: string;
    store?: MapStyleLocalStore;
    api?: StyleApi;
    createId?: () => string;
}

/**
 * Bridges the editor's metadata-rich style model to Teapot's authoritative membership API.
 * Browser metadata is retained for rendering/search, but only a validated Teapot asset ID crosses the copy API.
 */
export class TeapotMapEditorStyleAdapter implements MapEditorStyleAdapter {
    private readonly store: MapStyleLocalStore;
    private readonly api: StyleApi;
    private readonly controller: MapStyleController;
    private snapshot: MapStyleControllerSnapshot | undefined;
    private hydration: Promise<void> | undefined;
    private styles: TeapotMapStyleView[] = [];
    private entries: MapEditorStyleEntry[] = [];
    private notice: string | undefined;

    constructor(options: TeapotMapEditorStyleAdapterOptions) {
        this.store = options.store ?? new MapStyleLocalStore();
        this.api = options.api ?? teapotMapStyleApi;
        this.controller = new MapStyleController(
            options.ownerScope,
            true,
            this.store,
            this.api,
            (snapshot) => {
                this.snapshot = snapshot;
            },
            options.createId,
        );
    }

    async listStyles(signal?: AbortSignal): Promise<readonly MapEditorStyle[]> {
        await this.ensureHydrated(signal);
        return mapStylesForEditor(this.styles);
    }

    async listEntries(signal?: AbortSignal): Promise<readonly MapEditorStyleEntry[]> {
        await this.ensureHydrated(signal);
        return structuredClone(this.entries);
    }

    async createStyle(name: string, signal?: AbortSignal): Promise<MapEditorStyle> {
        throwIfAborted(signal);
        await this.ensureHydrated(signal);
        const style = await this.controller.create(name);
        throwIfAborted(signal);
        this.styles = mergeStyles(this.styles, style);
        this.notice = undefined;
        return mapStyleForEditor(style);
    }

    async copyAsset<TSnapshot>(
        input: CopyMapEditorStyleAssetInput<TSnapshot>,
        signal?: AbortSignal,
    ): Promise<MapEditorStyleEntry<TSnapshot>> {
        throwIfAborted(signal);
        await this.ensureHydrated(signal);
        const serverStyleId = this.serverStyleId(input.destinationStyleId);
        if (serverStyleId === undefined) throw new Error("That destination style is no longer available.");

        const existing = this.entries.find((entry) => sameEditorMembership(entry, input));
        if (existing !== undefined) return structuredClone(existing as MapEditorStyleEntry<TSnapshot>);

        const authorizedSource = toAuthorizedTeapotSource(input.source);
        let entry: MapEditorStyleEntry<TSnapshot>;
        if (authorizedSource !== undefined) {
            // Only the server-resolvable asset ID is sent. Rich metadata, previews, and snapshots stay local.
            const remote = await this.controller.copy(serverStyleId, authorizedSource);
            throwIfAborted(signal);
            entry = editorEntryFromCopy(input, remote.id, remote.createdAt);
            this.notice = undefined;
        } else {
            entry = editorEntryFromCopy(input, `local:${createLocalId()}`, new Date().toISOString());
            this.notice = LOCAL_ONLY_NOTICE;
        }
        this.entries = [...this.entries, entry];
        await this.persistEditorEntries();
        return structuredClone(entry);
    }

    getNotice(): string | undefined {
        return this.notice;
    }

    dispose(): void {
        this.controller.dispose();
    }

    private async ensureHydrated(signal?: AbortSignal): Promise<void> {
        if (this.hydration === undefined) {
            this.hydration = this.hydrate(signal).finally(() => {
                this.hydration = undefined;
            });
        }
        await this.hydration;
    }

    private async hydrate(signal?: AbortSignal): Promise<void> {
        throwIfAborted(signal);
        await this.controller.hydrate();
        throwIfAborted(signal);
        const controllerWarning = this.snapshot?.warning;
        const snapshot = this.snapshot ?? (await this.store.read(this.controller.ownerScope));
        this.styles = snapshot.styles;
        let entrySyncWarning: string | undefined;
        const results = await Promise.all(
            this.styles.map(async (style) => {
                try {
                    return await this.api.list(style.id, undefined, signal);
                } catch (error: unknown) {
                    entrySyncWarning =
                        error instanceof Error ? error.message : "Style memberships could not be synchronized.";
                    return { styles: [], entries: [] };
                }
            }),
        );
        throwIfAborted(signal);
        const remoteEntries = uniqueRemoteEntries(results.flatMap((result) => result.entries));
        const cachedEditorEntries = readEditorEntries(snapshot.editorEntries);
        this.entries = mergeRemoteAndEditorEntries(remoteEntries, cachedEditorEntries, this.styles);
        await this.store.write(this.controller.ownerScope, {
            styles: this.styles,
            entries: remoteEntries,
            editorEntries: this.entries,
        });
        this.notice = this.entries.some((entry) => entry.id.startsWith("local:"))
            ? LOCAL_ONLY_NOTICE
            : (controllerWarning ?? entrySyncWarning);
    }

    private serverStyleId(editorStyleId: string): string | undefined {
        if (editorStyleId === BUILT_IN_MAP_STYLE_ID) return undefined;
        if (editorStyleId === DEFAULT_MAP_STYLE_ID) return this.styles.find((style) => style.isDefault)?.id;
        return this.styles.find((style) => style.id === editorStyleId && !style.isDefault)?.id;
    }

    private async persistEditorEntries(): Promise<void> {
        await this.store.write(this.controller.ownerScope, { editorEntries: this.entries });
    }
}

export function createMapEditorStyleAdapterForIdentity(
    authToken: string | null,
    userUuid: string | undefined,
    options: Omit<TeapotMapEditorStyleAdapterOptions, "ownerScope"> = {},
): MapEditorStyleAdapter {
    const ownerScope = mapStyleOwnerScope(authToken, userUuid);
    return ownerScope === "anonymous"
        ? createLocalMapEditorStyleAdapter()
        : new TeapotMapEditorStyleAdapter({ ...options, ownerScope });
}

let configuredOwnerScope: string | undefined;
let activeTeapotAdapter: TeapotMapEditorStyleAdapter | undefined;

/** Called by the shared style switcher before its first hydration. */
export function configureMapEditorStyleStoreForCurrentUser(): void {
    const token = localUserStore.getAuthToken();
    const uuid = localUserStore.getLocalUser()?.uuid;
    const ownerScope = mapStyleOwnerScope(token, uuid);
    if (ownerScope === configuredOwnerScope) return;
    activeTeapotAdapter?.dispose();
    activeTeapotAdapter =
        ownerScope === "anonymous"
            ? undefined
            : new TeapotMapEditorStyleAdapter({ ownerScope, api: teapotMapStyleApi });
    mapEditorStyleStore.useAdapter(activeTeapotAdapter ?? createLocalMapEditorStyleAdapter());
    configuredOwnerScope = ownerScope;
}

function mapStylesForEditor(styles: readonly TeapotMapStyleView[]): MapEditorStyle[] {
    const mapped = styles.map(mapStyleForEditor);
    return [
        ...(mapped.some((style) => style.id === DEFAULT_MAP_STYLE_ID)
            ? mapped
            : [
                  {
                      id: DEFAULT_MAP_STYLE_ID,
                      name: "Default style",
                      kind: "default" as const,
                      readOnly: false,
                  },
                  ...mapped,
              ]),
        { id: BUILT_IN_MAP_STYLE_ID, name: "Built-in", kind: "built-in" as const, readOnly: true },
    ];
}

function mapStyleForEditor(style: TeapotMapStyleView): MapEditorStyle {
    return {
        id: style.isDefault ? DEFAULT_MAP_STYLE_ID : style.id,
        name: style.isDefault ? "Default style" : style.name,
        kind: style.isDefault ? "default" : "custom",
        readOnly: false,
        createdAt: style.createdAt,
    };
}

function mergeStyles(styles: readonly TeapotMapStyleView[], style: TeapotMapStyleView): TeapotMapStyleView[] {
    return [...styles.filter((candidate) => candidate.id !== style.id), style];
}

function toAuthorizedTeapotSource(source: MapEditorStyleSource): TeapotMapStyleSource | undefined {
    if (!source.type.startsWith("teapot-") || !TEAPOT_ASSET_ID.test(source.key) || !source.version.endsWith("-v1")) {
        return undefined;
    }
    return { type: "teapot-asset", assetId: source.key, sourceVersion: 1 };
}

function editorEntryFromCopy<TSnapshot>(
    input: CopyMapEditorStyleAssetInput<TSnapshot>,
    id: string,
    createdAt: string,
): MapEditorStyleEntry<TSnapshot> {
    return {
        id,
        styleId: input.destinationStyleId,
        assetKind: input.assetKind,
        source: structuredClone(input.source),
        metadataVersion: 1,
        metadata: structuredClone(input.metadata),
        derivedFromAssetId: input.derivedFromAssetId,
        createdAt,
    };
}

function mergeRemoteAndEditorEntries(
    remote: readonly TeapotMapStyleEntryView[],
    editor: readonly MapEditorStyleEntry[],
    styles: readonly TeapotMapStyleView[],
): MapEditorStyleEntry[] {
    const remoteIds = new Set(remote.map((entry) => entry.id));
    const merged = remote.map((entry) => {
        const cached = editor.find(
            (candidate) =>
                candidate.id === entry.id ||
                (entry.source.type === "teapot-asset" &&
                    candidate.source.key === entry.source.assetId &&
                    candidate.styleId === mapServerStyleId(entry.styleId, styles)),
        );
        return cached ?? mapRemoteEntry(entry, styles);
    });
    return [...merged, ...editor.filter((entry) => entry.id.startsWith("local:") || !remoteIds.has(entry.id))];
}

function mapRemoteEntry(entry: TeapotMapStyleEntryView, styles: readonly TeapotMapStyleView[]): MapEditorStyleEntry {
    const source: MapEditorStyleSource =
        entry.source.type === "teapot-asset"
            ? {
                  type: `teapot-${entry.assetKind}`,
                  key: entry.source.assetId,
                  version: `teapot-${entry.assetKind}-v1`,
              }
            : {
                  type: "built-in",
                  key: `${entry.source.namespace}:${entry.source.key}`,
                  version: `built-in-v${entry.source.sourceVersion}`,
              };
    return {
        id: entry.id,
        styleId: mapServerStyleId(entry.styleId, styles),
        assetKind: mapAssetKind(entry.assetKind),
        source,
        metadataVersion: 1,
        metadata: metadataForEditor(entry.metadata),
        derivedFromAssetId: entry.derivedFromAssetId ?? undefined,
        createdAt: entry.createdAt,
    };
}

function mapServerStyleId(styleId: string, styles: readonly TeapotMapStyleView[]): string {
    return styles.find((style) => style.id === styleId)?.isDefault ? DEFAULT_MAP_STYLE_ID : styleId;
}

function mapAssetKind(kind: TeapotMapStyleAssetKind): MapEditorStyleAssetKind {
    return kind === "tileset" || kind === "terrain-surface" ? "terrain" : "object";
}

function metadataForEditor(metadata: unknown): MapEditorStyleAssetMetadata {
    const record = isRecord(metadata) ? metadata : {};
    return {
        name: typeof record.name === "string" ? record.name : "Style asset",
        ...(typeof record.description === "string" ? { description: record.description } : {}),
        tags: stringArray(record.tags),
        keywords: stringArray(record.keywords ?? record.searchTerms),
        ...(typeof record.category === "string" ? { category: record.category } : {}),
        ...(typeof record.previewUrl === "string" ? { previewUrl: record.previewUrl } : {}),
        snapshot: structuredClone(metadata),
    };
}

function readEditorEntries(value: unknown): MapEditorStyleEntry[] {
    return Array.isArray(value) ? (structuredClone(value) as MapEditorStyleEntry[]) : [];
}

function uniqueRemoteEntries(entries: readonly TeapotMapStyleEntryView[]): TeapotMapStyleEntryView[] {
    return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

function sameEditorMembership(entry: MapEditorStyleEntry, input: CopyMapEditorStyleAssetInput): boolean {
    return (
        entry.styleId === input.destinationStyleId &&
        entry.assetKind === input.assetKind &&
        entry.source.type === input.source.type &&
        entry.source.key === input.source.key &&
        entry.source.version === input.source.version
    );
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted === true) throw new DOMException("The operation was aborted", "AbortError");
}

function createLocalId(): string {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
