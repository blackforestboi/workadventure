import type { MapStyleLocalSnapshot, MapStyleLocalStore, MapStylePendingMutation } from "./MapStyleLocalStore";
import type {
    TeapotMapStyleApi,
    TeapotMapStyleAssetKind,
    TeapotMapStyleEntryView,
    TeapotMapStyleSource,
    TeapotMapStyleView,
} from "./TeapotMapStyleApi";

export interface MapStyleControllerSnapshot extends MapStyleLocalSnapshot {
    loading: boolean;
    warning?: string;
    draftName?: string;
}

type Listener = (snapshot: MapStyleControllerSnapshot) => void;
type LocalStore = Pick<MapStyleLocalStore, "read" | "write">;
type RemoteApi = Pick<TeapotMapStyleApi, "list" | "create" | "copy">;

export function mapStyleOwnerScope(authToken: string | null, userUuid: string | undefined): string {
    const uuid = userUuid?.trim() ?? "";
    return authToken !== null && authToken.length > 0 && uuid.length > 0 ? `user:${uuid}` : "anonymous";
}

export class MapStyleController {
    private epoch = 0;
    private abort: AbortController | undefined;

    constructor(
        readonly ownerScope: string,
        private readonly authenticated: boolean,
        private readonly store: LocalStore,
        private readonly api: RemoteApi,
        private readonly listener: Listener,
        private readonly createId: () => string = () => crypto.randomUUID(),
    ) {}

    async hydrate(kind?: TeapotMapStyleAssetKind): Promise<void> {
        const epoch = ++this.epoch;
        this.abort?.abort();
        const request = new AbortController();
        this.abort = request;
        const local = await this.store.read(this.ownerScope);
        if (epoch !== this.epoch) return;
        this.publish({ ...local, loading: this.authenticated });
        if (!this.authenticated) return;
        try {
            const remote = await this.api.list(local.activeStyleId, kind, request.signal);
            if (epoch !== this.epoch) return;
            const activeStyleId = selectActiveStyle(remote.styles, local.activeStyleId);
            const saved = await this.store.write(this.ownerScope, { ...remote, activeStyleId });
            if (epoch === this.epoch) this.publish({ ...saved, loading: false });
        } catch (error: unknown) {
            if (epoch !== this.epoch || request.signal.aborted) return;
            this.publish({ ...local, loading: false, warning: message(error) });
        }
    }

    async select(styleId: string, kind?: TeapotMapStyleAssetKind): Promise<void> {
        const current = await this.store.read(this.ownerScope);
        if (!current.styles.some((style) => style.id === styleId)) return;
        const saved = await this.store.write(this.ownerScope, { activeStyleId: styleId, entries: [] });
        this.publish({ ...saved, loading: this.authenticated });
        if (this.authenticated) await this.hydrate(kind);
    }

    async create(name: string): Promise<TeapotMapStyleView> {
        const idempotencyKey = this.createId();
        const current = await this.store.read(this.ownerScope);
        const pending: MapStylePendingMutation = {
            key: idempotencyKey,
            type: "create",
            payload: { name },
            createdAt: new Date().toISOString(),
        };
        await this.store.write(this.ownerScope, { pending: [...current.pending, pending] });
        if (!this.authenticated) {
            const now = new Date().toISOString();
            const style: TeapotMapStyleView = {
                id: `local:${idempotencyKey}`,
                name: name.trim(),
                isDefault: false,
                isBuiltIn: false,
                createdAt: now,
                updatedAt: now,
            };
            const saved = await this.store.write(this.ownerScope, {
                styles: [...current.styles, style],
                activeStyleId: style.id,
                pending: [],
            });
            this.publish({ ...saved, loading: false });
            return style;
        }
        try {
            const style = await this.api.create(name, idempotencyKey);
            const latest = await this.store.read(this.ownerScope);
            const styles = [...latest.styles.filter((item) => item.id !== style.id), style];
            const saved = await this.store.write(this.ownerScope, {
                styles,
                activeStyleId: style.id,
                pending: latest.pending.filter((item) => item.key !== idempotencyKey),
            });
            this.publish({ ...saved, loading: false });
            return style;
        } catch (error: unknown) {
            const latest = await this.store.read(this.ownerScope);
            this.publish({ ...latest, loading: false, warning: message(error), draftName: name });
            throw error;
        }
    }

    async copy(styleId: string, source: TeapotMapStyleSource): Promise<TeapotMapStyleEntryView> {
        if (!this.authenticated) throw new Error("Sign in before copying an asset into a style.");
        const key = this.createId();
        const current = await this.store.read(this.ownerScope);
        const pending: MapStylePendingMutation = {
            key,
            type: "copy",
            payload: { styleId, sourceKey: JSON.stringify(source) },
            createdAt: new Date().toISOString(),
        };
        await this.store.write(this.ownerScope, { pending: [...current.pending, pending] });
        try {
            const entry = await this.api.copy(styleId, source, key);
            const latest = await this.store.read(this.ownerScope);
            const saved = await this.store.write(this.ownerScope, {
                entries: [...latest.entries.filter((item) => item.id !== entry.id), entry],
                pending: latest.pending.filter((item) => item.key !== key),
            });
            this.publish({ ...saved, loading: false });
            return entry;
        } catch (error: unknown) {
            const latest = await this.store.read(this.ownerScope);
            this.publish({ ...latest, loading: false, warning: message(error) });
            throw error;
        }
    }

    dispose(): void {
        this.epoch += 1;
        this.abort?.abort();
    }

    private publish(snapshot: MapStyleControllerSnapshot): void {
        this.listener(structuredClone(snapshot));
    }
}

function selectActiveStyle(styles: TeapotMapStyleView[], requested?: string): string | undefined {
    return styles.some((style) => style.id === requested)
        ? requested
        : (styles.find((style) => style.isDefault)?.id ?? styles[0]?.id);
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : "Map styles could not be synchronized";
}
