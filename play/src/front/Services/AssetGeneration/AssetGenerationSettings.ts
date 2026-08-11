import type { Readable, Writable } from "svelte/store";
import { get, writable } from "svelte/store";

import { localUserStore } from "../../Connection/LocalUserStore";
import {
    hostedAgentConnectionApi,
    type HostedAgentConnectionStart,
    type HostedAgentConnectionStatus,
    type HostedAgentProvider,
} from "../HostedAgentConnectionApi";
import { assetGenerationSession } from "./AssetGenerationSession";
import { OPENROUTER_GENERATION_MODEL_ID } from "./OpenRouterImageProvider";
import type { AssetGenerationModel, AssetGenerationProviderId } from "./AssetGenerationTypes";

const PREFERENCES_KEY = "teapot.asset-generation.preferences.v1";
const DEFAULT_PROVIDER: ConfigurableAssetGenerationProviderId = "openrouter";

export type ConfigurableAssetGenerationProviderId = Exclude<AssetGenerationProviderId, "fake">;
export type AssetGenerationSettingsLifecycle = "disconnected" | "connecting" | "connected" | "failed";

export interface AssetGenerationSettingsState {
    providerId: ConfigurableAssetGenerationProviderId;
    models: readonly AssetGenerationModel[];
    modelId: string;
    lifecycle: AssetGenerationSettingsLifecycle;
    vaultAvailable: boolean;
    initialized: boolean;
    hostedConnection?: HostedAgentConnectionStart;
    error?: string;
}

export interface ReadyAssetGenerationSelection {
    providerId: ConfigurableAssetGenerationProviderId;
    modelId: string;
}

interface AssetGenerationPreferences {
    providerId: ConfigurableAssetGenerationProviderId;
    modelIds: Partial<Record<ConfigurableAssetGenerationProviderId, string>>;
}

export interface AssetGenerationPreferenceStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface AssetGenerationSettingsBackend {
    connect(
        providerId: ConfigurableAssetGenerationProviderId,
        credential: string,
        persistence?: { passphrase: string; label?: string },
    ): Promise<void>;
    reconnectFromVault(providerId: ConfigurableAssetGenerationProviderId, passphrase: string): Promise<void>;
    listModels(providerId: ConfigurableAssetGenerationProviderId): Promise<readonly AssetGenerationModel[]>;
    startHostedConnection(provider: HostedAgentProvider): Promise<HostedAgentConnectionStart>;
    getHostedConnectionStatus(provider: HostedAgentProvider, pairingId: string): Promise<HostedAgentConnectionStatus>;
    completeHostedConnection(
        provider: HostedAgentProvider,
        pairingId: string,
        code: string,
    ): Promise<HostedAgentConnectionStatus>;
    getHostedConnection(provider: HostedAgentProvider): Promise<boolean>;
    disconnectHostedConnection(provider: HostedAgentProvider): Promise<void>;
    getApplicationBearer(): string | null;
    openAuthorizationUrl(url: string): void;
    hasPersistedVault(): Promise<boolean>;
    deleteVault(): Promise<void>;
    lock(): void;
}

export interface AssetGenerationSettingsOptions {
    backend: AssetGenerationSettingsBackend;
    storage?: AssetGenerationPreferenceStorage;
    enabledProviders?: readonly ConfigurableAssetGenerationProviderId[];
    fixedModelIds?: Partial<Record<ConfigurableAssetGenerationProviderId, string>>;
    pollIntervalMs?: number;
    wait?: (milliseconds: number) => Promise<void>;
}

export class AssetGenerationSettingsController implements Readable<AssetGenerationSettingsState> {
    private readonly state: Writable<AssetGenerationSettingsState>;
    private preferences: AssetGenerationPreferences;
    private initializePromise: Promise<void> | undefined;
    private operationId = 0;
    private hostedProvisioningOperationId: number | undefined;

    public constructor(private readonly options: AssetGenerationSettingsOptions) {
        this.preferences = readPreferences(options.storage, options.enabledProviders);
        this.state = writable<AssetGenerationSettingsState>({
            providerId: this.preferences.providerId,
            models: [],
            modelId: this.preferences.modelIds[this.preferences.providerId] ?? "",
            lifecycle: "disconnected",
            vaultAvailable: false,
            initialized: false,
        });
    }

    public subscribe: Readable<AssetGenerationSettingsState>["subscribe"] = (run, invalidate) =>
        this.state.subscribe(run, invalidate);

    public initialize(): Promise<void> {
        if (this.initializePromise !== undefined) return this.initializePromise;
        this.initializePromise = this.initializeConnectionState();
        return this.initializePromise;
    }

    public setProvider(providerId: ConfigurableAssetGenerationProviderId): void {
        if (!this.isEnabledProvider(providerId)) return;
        const current = get(this.state);
        if (current.providerId === providerId) return;
        this.operationId += 1;
        this.hostedProvisioningOperationId = undefined;
        const previousHostedProvider = toHostedProvider(current.providerId);
        if (previousHostedProvider !== undefined && current.lifecycle !== "disconnected") {
            this.options.backend.disconnectHostedConnection(previousHostedProvider).catch(() => undefined);
        }
        this.options.backend.lock();
        this.preferences = { ...this.preferences, providerId };
        const preferenceError = this.persistPreferences();
        this.patch({
            providerId,
            models: [],
            modelId: this.preferences.modelIds[providerId] ?? "",
            lifecycle: "disconnected",
            hostedConnection: undefined,
            error: preferenceError,
        });
    }

    private isEnabledProvider(providerId: ConfigurableAssetGenerationProviderId): boolean {
        return this.options.enabledProviders?.includes(providerId) ?? true;
    }

    public async connectWithApiKey(
        credential: string,
        persistence?: { passphrase: string; label?: string },
    ): Promise<void> {
        const providerId = get(this.state).providerId;
        if (providerId !== "openrouter") {
            this.fail("API-key connection is available only for OpenRouter.");
            return;
        }
        if (credential.trim() === "") {
            this.fail("An OpenRouter API key is required.");
            return;
        }
        await this.connect(providerId, credential, persistence);
    }

    public async startHostedConnection(): Promise<void> {
        const providerId = get(this.state).providerId;
        const hostedProvider = toHostedProvider(providerId);
        if (hostedProvider === undefined) {
            this.fail("Choose Codex or Claude before connecting a subscription.");
            return;
        }
        const operationId = this.beginConnection();
        try {
            const connection = await this.options.backend.startHostedConnection(hostedProvider);
            if (operationId !== this.operationId) return;
            this.options.backend.openAuthorizationUrl(connection.authorizationUrl);
            this.patch({ hostedConnection: connection });
            this.pollHostedConnection(operationId, providerId, hostedProvider, connection.pairingId).catch(
                (error: unknown) => this.failConnection(operationId, error),
            );
        } catch (error: unknown) {
            this.failConnection(operationId, error);
        }
    }

    public async completeHostedAuthorizationCode(code: string): Promise<void> {
        const current = get(this.state);
        const hostedProvider = toHostedProvider(current.providerId);
        if (hostedProvider === undefined || current.hostedConnection?.mode !== "authorization-code") {
            this.fail("There is no authorization-code connection to complete.");
            return;
        }
        if (code.trim() === "") {
            this.fail("Enter the authorization code returned by the provider.");
            return;
        }
        try {
            const status = await this.options.backend.completeHostedConnection(
                hostedProvider,
                current.hostedConnection.pairingId,
                code.trim(),
            );
            if (status.state === "failed" || status.state === "expired") {
                this.fail(status.message ?? `The hosted connection ${status.state}.`);
                return;
            }
            if (status.state === "connected") {
                await this.provisionHostedConnection(this.operationId, current.providerId);
            }
        } catch (error: unknown) {
            this.fail(toMessage(error, "The authorization code could not be completed."));
        }
    }

    public async reconnectSavedCredential(passphrase: string): Promise<void> {
        const providerId = get(this.state).providerId;
        if (providerId !== "openrouter") {
            this.fail("Saved browser credentials are available only for OpenRouter.");
            return;
        }
        if (passphrase === "") {
            this.fail("A vault passphrase is required.");
            return;
        }
        const operationId = this.beginConnection();
        try {
            await this.options.backend.reconnectFromVault(providerId, passphrase);
            await this.finishConnection(operationId, providerId);
        } catch (error: unknown) {
            this.failConnection(operationId, error);
        }
    }

    public selectModel(modelId: string): void {
        const current = get(this.state);
        if (!current.models.some((model) => model.id === modelId)) {
            this.patch({ error: "The selected model is not available for this provider." });
            return;
        }
        this.preferences = {
            ...this.preferences,
            modelIds: { ...this.preferences.modelIds, [current.providerId]: modelId },
        };
        this.patch({ modelId, error: this.persistPreferences() });
    }

    public async disconnect(): Promise<void> {
        this.operationId += 1;
        this.hostedProvisioningOperationId = undefined;
        const hostedProvider = toHostedProvider(get(this.state).providerId);
        this.options.backend.lock();
        try {
            if (hostedProvider !== undefined) await this.options.backend.disconnectHostedConnection(hostedProvider);
            this.patch({ lifecycle: "disconnected", hostedConnection: undefined, error: undefined });
        } catch (error: unknown) {
            this.patch({
                lifecycle: "failed",
                error: toMessage(error, "The hosted subscription could not be disconnected."),
            });
        }
    }

    /** Clears a rejected session credential so the UI cannot keep claiming it is usable. */
    public markCredentialRejected(): void {
        this.operationId += 1;
        this.hostedProvisioningOperationId = undefined;
        this.options.backend.lock();
        this.patch({
            models: [],
            lifecycle: "failed",
            error: "This OpenRouter API key was rejected. Paste a valid key to reconnect.",
        });
    }

    public async deleteVault(): Promise<void> {
        this.operationId += 1;
        this.options.backend.lock();
        try {
            await this.options.backend.deleteVault();
            this.patch({ vaultAvailable: false, lifecycle: "disconnected", error: undefined });
        } catch (error: unknown) {
            this.patch({ error: toMessage(error, "The saved credential vault could not be deleted.") });
        }
    }

    /** Returns an immutable selection snapshot for one generation request. */
    public getReadySelection(): ReadyAssetGenerationSelection | undefined {
        const current = get(this.state);
        if (current.lifecycle !== "connected") return undefined;
        const fixedModelId = this.options.fixedModelIds?.[current.providerId];
        if (fixedModelId !== undefined) {
            return { providerId: current.providerId, modelId: fixedModelId };
        }
        if (current.modelId === "" || !current.models.some((model) => model.id === current.modelId)) {
            return undefined;
        }
        return { providerId: current.providerId, modelId: current.modelId };
    }

    private async connect(
        providerId: ConfigurableAssetGenerationProviderId,
        credential: string,
        persistence?: { passphrase: string; label?: string },
    ): Promise<void> {
        const operationId = this.beginConnection();
        try {
            await this.options.backend.connect(providerId, credential, persistence);
            if (persistence !== undefined && operationId === this.operationId) {
                this.patch({ vaultAvailable: true });
            }
            await this.finishConnection(operationId, providerId);
        } catch (error: unknown) {
            this.failConnection(operationId, error);
        }
    }

    private async initializeConnectionState(): Promise<void> {
        try {
            const vaultAvailable = await this.options.backend.hasPersistedVault();
            this.patch({ vaultAvailable, initialized: true });
        } catch (error: unknown) {
            this.patch({
                initialized: true,
                error: toMessage(error, "The saved credential vault is unavailable."),
            });
            return;
        }

        await this.restoreExistingHostedConnection();
    }

    /** Restores a provider OAuth session owned by the server after a browser reload. */
    public async restoreExistingHostedConnection(): Promise<void> {
        const current = get(this.state);
        const hostedProvider = toHostedProvider(current.providerId);
        if (hostedProvider === undefined || current.lifecycle === "connected" || current.lifecycle === "connecting")
            return;

        try {
            if (!(await this.options.backend.getHostedConnection(hostedProvider))) return;
            const operationId = this.beginConnection();
            await this.provisionHostedConnection(operationId, current.providerId);
        } catch (error: unknown) {
            this.patch({
                lifecycle: "failed",
                error: toMessage(error, "The existing AI subscription could not be restored."),
            });
        }
    }

    private beginConnection(): number {
        this.operationId += 1;
        this.hostedProvisioningOperationId = undefined;
        this.patch({ lifecycle: "connecting", models: [], hostedConnection: undefined, error: undefined });
        return this.operationId;
    }

    private async pollHostedConnection(
        operationId: number,
        providerId: ConfigurableAssetGenerationProviderId,
        hostedProvider: HostedAgentProvider,
        pairingId: string,
    ): Promise<void> {
        while (operationId === this.operationId) {
            await (this.options.wait ?? defaultWait)(this.options.pollIntervalMs ?? 1_500);
            if (operationId !== this.operationId) return;
            const status = await this.options.backend.getHostedConnectionStatus(hostedProvider, pairingId);
            if (status.state === "pending") continue;
            if (status.state === "failed" || status.state === "expired") {
                this.patch({
                    lifecycle: "failed",
                    error: status.message ?? `The hosted connection ${status.state}.`,
                });
                return;
            }
            await this.provisionHostedConnection(operationId, providerId);
            return;
        }
    }

    private async provisionHostedConnection(
        operationId: number,
        providerId: ConfigurableAssetGenerationProviderId,
    ): Promise<void> {
        if (operationId !== this.operationId || this.hostedProvisioningOperationId === operationId) return;
        this.hostedProvisioningOperationId = operationId;
        const applicationBearer = this.options.backend.getApplicationBearer();
        if (applicationBearer === null || applicationBearer.length === 0) {
            throw new Error("The WorkAdventure session expired before the AI subscription connected.");
        }
        await this.options.backend.connect(providerId, applicationBearer);
        await this.finishConnection(operationId, providerId);
    }

    private async finishConnection(
        operationId: number,
        providerId: ConfigurableAssetGenerationProviderId,
    ): Promise<void> {
        if (operationId !== this.operationId || get(this.state).providerId !== providerId) return;
        const models = await this.options.backend.listModels(providerId);
        if (operationId !== this.operationId || get(this.state).providerId !== providerId) return;
        const preferredModelId = this.preferences.modelIds[providerId];
        const modelId = models.some((model) => model.id === preferredModelId)
            ? (preferredModelId ?? "")
            : (models[0]?.id ?? "");
        if (modelId === "") {
            this.patch({
                models,
                modelId,
                lifecycle: "failed",
                error: "This subscription did not return an available model.",
            });
            return;
        }
        this.preferences = {
            ...this.preferences,
            modelIds: { ...this.preferences.modelIds, [providerId]: modelId },
        };
        this.patch({ models, modelId, lifecycle: "connected", error: this.persistPreferences() });
    }

    private failConnection(operationId: number, error: unknown): void {
        if (operationId !== this.operationId) return;
        this.patch({
            lifecycle: "failed",
            models: [],
            error: toMessage(error, "The provider could not be connected."),
        });
    }

    private fail(error: string): void {
        this.patch({ lifecycle: "failed", error });
    }

    private patch(patch: Partial<AssetGenerationSettingsState>): void {
        this.state.update((state) => ({ ...state, ...patch }));
    }

    private persistPreferences(): string | undefined {
        try {
            this.options.storage?.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));
            return undefined;
        } catch {
            return "AI provider preferences could not be saved in this browser.";
        }
    }
}

const sessionBackend: AssetGenerationSettingsBackend = {
    connect: (providerId, credential, persistence) =>
        assetGenerationSession.connect(providerId, credential, persistence),
    reconnectFromVault: (providerId, passphrase) => assetGenerationSession.reconnectFromVault(providerId, passphrase),
    listModels: (providerId) => assetGenerationSession.worker.listModels(providerId),
    startHostedConnection: (provider) => hostedAgentConnectionApi.start(provider),
    getHostedConnectionStatus: (provider, pairingId) => hostedAgentConnectionApi.status(provider, pairingId),
    completeHostedConnection: (provider, pairingId, code) =>
        hostedAgentConnectionApi.complete(provider, pairingId, code),
    getHostedConnection: (provider) => hostedAgentConnectionApi.connection(provider),
    disconnectHostedConnection: (provider) => hostedAgentConnectionApi.disconnect(provider),
    getApplicationBearer: () => localUserStore.getAuthToken(),
    openAuthorizationUrl: (url) => {
        const popup = window.open(url, "teapot-hosted-agent-oauth", "popup,width=620,height=760");
        if (popup === null) throw new Error("Allow the provider authorization window, then connect again.");
    },
    hasPersistedVault: () => assetGenerationSession.vault.hasPersistedVault(),
    deleteVault: () => assetGenerationSession.vault.deleteVault(),
    lock: () => assetGenerationSession.lock(),
};

export const assetGenerationSettings = new AssetGenerationSettingsController({
    backend: sessionBackend,
    storage: getBrowserPreferenceStorage(),
    // Subscription bridges remain implemented but are intentionally unavailable in the product for now.
    enabledProviders: ["openrouter"],
    fixedModelIds: { openrouter: OPENROUTER_GENERATION_MODEL_ID },
});

function readPreferences(
    storage?: AssetGenerationPreferenceStorage,
    enabledProviders?: readonly ConfigurableAssetGenerationProviderId[],
): AssetGenerationPreferences {
    try {
        const value = storage?.getItem(PREFERENCES_KEY);
        if (value === undefined || value === null) return { providerId: DEFAULT_PROVIDER, modelIds: {} };
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return { providerId: DEFAULT_PROVIDER, modelIds: {} };
        }
        const storedProvider =
            "providerId" in parsed && isConfigurableProvider(parsed.providerId) ? parsed.providerId : undefined;
        const providerId =
            storedProvider !== undefined && (enabledProviders?.includes(storedProvider) ?? true)
                ? storedProvider
                : DEFAULT_PROVIDER;
        const modelIds = "modelIds" in parsed && isModelPreferences(parsed.modelIds) ? parsed.modelIds : {};
        return { providerId, modelIds };
    } catch {
        return { providerId: DEFAULT_PROVIDER, modelIds: {} };
    }
}

function isConfigurableProvider(value: unknown): value is ConfigurableAssetGenerationProviderId {
    return value === "openrouter" || value === "codex-cli" || value === "claude-cli";
}

function toHostedProvider(providerId: ConfigurableAssetGenerationProviderId): HostedAgentProvider | undefined {
    if (providerId === "codex-cli") return "codex";
    if (providerId === "claude-cli") return "claude";
    return undefined;
}

function isModelPreferences(value: unknown): value is Partial<Record<ConfigurableAssetGenerationProviderId, string>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return Object.entries(value).every(
        ([providerId, modelId]) => isConfigurableProvider(providerId) && typeof modelId === "string",
    );
}

function getBrowserPreferenceStorage(): AssetGenerationPreferenceStorage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        return undefined;
    }
}

function toMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

function defaultWait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
