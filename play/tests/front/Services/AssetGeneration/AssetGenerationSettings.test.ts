import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";

import {
    AssetGenerationSettingsController,
    type AssetGenerationPreferenceStorage,
    type AssetGenerationSettingsBackend,
} from "../../../../src/front/Services/AssetGeneration/AssetGenerationSettings";
import type { AssetGenerationModel } from "../../../../src/front/Services/AssetGeneration/AssetGenerationTypes";

const models: readonly AssetGenerationModel[] = [
    {
        id: "image-fast",
        name: "Image Fast",
        inputModalities: ["text"],
        outputModalities: ["image"],
        supportedParameters: {},
        supportsStreaming: false,
    },
    {
        id: "image-quality",
        name: "Image Quality",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        supportedParameters: {},
        supportsStreaming: false,
    },
];

class MemoryPreferenceStorage implements AssetGenerationPreferenceStorage {
    readonly values = new Map<string, string>();

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

function createBackend(overrides: Partial<AssetGenerationSettingsBackend> = {}): AssetGenerationSettingsBackend {
    return {
        connect: vi.fn(() => Promise.resolve()),
        reconnectFromVault: vi.fn(() => Promise.resolve()),
        listModels: vi.fn(() => Promise.resolve(models)),
        startHostedConnection: vi.fn(() =>
            Promise.resolve({
                pairingId: "pairing-1",
                authorizationUrl: "https://provider.example/authorize",
                mode: "device-code" as const,
                userCode: "ABCD-EFGH",
            }),
        ),
        getHostedConnectionStatus: vi.fn(() => Promise.resolve({ state: "connected" as const })),
        completeHostedConnection: vi.fn(() => Promise.resolve({ state: "connected" as const })),
        getHostedConnection: vi.fn(() => Promise.resolve(false)),
        disconnectHostedConnection: vi.fn(() => Promise.resolve()),
        getApplicationBearer: vi.fn(() => "workadventure-jwt"),
        openAuthorizationUrl: vi.fn(),
        hasPersistedVault: vi.fn(() => Promise.resolve(false)),
        deleteVault: vi.fn(() => Promise.resolve()),
        lock: vi.fn(),
        ...overrides,
    };
}

describe("AssetGenerationSettingsController", () => {
    it("restores only non-secret provider/model preferences and reports vault availability", async () => {
        const storage = new MemoryPreferenceStorage();
        storage.values.set(
            "teapot.asset-generation.preferences.v1",
            JSON.stringify({ providerId: "openrouter", modelIds: { openrouter: "image-quality" } }),
        );
        const controller = new AssetGenerationSettingsController({
            backend: createBackend({ hasPersistedVault: vi.fn(() => Promise.resolve(true)) }),
            storage,
        });

        await controller.initialize();

        expect(get(controller)).toMatchObject({
            providerId: "openrouter",
            modelId: "image-quality",
            lifecycle: "disconnected",
            vaultAvailable: true,
            initialized: true,
        });
        expect(controller.getReadySelection()).toBeUndefined();
    });

    it("connects through the session boundary, selects a compatible remembered model, and never persists secrets", async () => {
        const storage = new MemoryPreferenceStorage();
        storage.values.set(
            "teapot.asset-generation.preferences.v1",
            JSON.stringify({ providerId: "openrouter", modelIds: { openrouter: "image-quality" } }),
        );
        const backend = createBackend();
        const controller = new AssetGenerationSettingsController({ backend, storage });

        await controller.connectWithApiKey("private-api-key", {
            passphrase: "private-passphrase",
            label: "OpenRouter",
        });

        expect(backend.connect).toHaveBeenCalledWith("openrouter", "private-api-key", {
            passphrase: "private-passphrase",
            label: "OpenRouter",
        });
        expect(get(controller)).toMatchObject({
            lifecycle: "connected",
            models,
            modelId: "image-quality",
            vaultAvailable: true,
        });
        expect([...storage.values.values()].join(" ")).not.toContain("private-api-key");
        expect([...storage.values.values()].join(" ")).not.toContain("private-passphrase");
    });

    it("restores an already-authorized Codex subscription when a new editor opens", async () => {
        const storage = new MemoryPreferenceStorage();
        storage.values.set(
            "teapot.asset-generation.preferences.v1",
            JSON.stringify({ providerId: "codex-cli", modelIds: { "codex-cli": "image-quality" } }),
        );
        const backend = createBackend({ getHostedConnection: vi.fn(() => Promise.resolve(true)) });
        const controller = new AssetGenerationSettingsController({ backend, storage });

        await controller.initialize();

        expect(backend.getHostedConnection).toHaveBeenCalledWith("codex");
        expect(backend.connect).toHaveBeenCalledWith("codex-cli", "workadventure-jwt");
        expect(controller.getReadySelection()).toEqual({ providerId: "codex-cli", modelId: "image-quality" });
    });

    it("restricts the product configuration to OpenRouter while subscription piping remains available", async () => {
        const storage = new MemoryPreferenceStorage();
        storage.values.set(
            "teapot.asset-generation.preferences.v1",
            JSON.stringify({ providerId: "codex-cli", modelIds: { openrouter: "image-quality" } }),
        );
        const backend = createBackend({ getHostedConnection: vi.fn(() => Promise.resolve(true)) });
        const controller = new AssetGenerationSettingsController({
            backend,
            storage,
            enabledProviders: ["openrouter"],
        });

        await controller.initialize();
        controller.setProvider("codex-cli");

        expect(get(controller)).toMatchObject({ providerId: "openrouter", lifecycle: "disconnected" });
        expect(backend.getHostedConnection).not.toHaveBeenCalled();
        expect(backend.connect).not.toHaveBeenCalled();
    });

    it("returns a stable ready-selection snapshot while later model changes affect only future generations", async () => {
        const controller = new AssetGenerationSettingsController({ backend: createBackend() });
        await controller.connectWithApiKey("key");

        const firstGeneration = controller.getReadySelection();
        controller.selectModel("image-quality");

        expect(firstGeneration).toEqual({ providerId: "openrouter", modelId: "image-fast" });
        expect(controller.getReadySelection()).toEqual({ providerId: "openrouter", modelId: "image-quality" });
    });

    it("clears the ready state when a generation rejects the configured credential", async () => {
        const backend = createBackend();
        const controller = new AssetGenerationSettingsController({ backend });
        await controller.connectWithApiKey("key");

        controller.markCredentialRejected();

        expect(controller.getReadySelection()).toBeUndefined();
        expect(get(controller)).toMatchObject({
            lifecycle: "failed",
            models: [],
            error: "This OpenRouter API key was rejected. Paste a valid key to reconnect.",
        });
        expect(backend.lock).toHaveBeenCalledOnce();
    });

    it("uses the fixed product model even when a hot-reloaded connection still contains an older model list", async () => {
        const controller = new AssetGenerationSettingsController({
            backend: createBackend(),
            fixedModelIds: { openrouter: "google/gemini-3.1-flash-lite-image" },
        });
        await controller.connectWithApiKey("key");

        expect(get(controller).modelId).toBe("image-fast");
        expect(controller.getReadySelection()).toEqual({
            providerId: "openrouter",
            modelId: "google/gemini-3.1-flash-lite-image",
        });
    });

    it("ignores a stale connection completion after the user changes provider", async () => {
        let resolveConnection: (() => void) | undefined;
        const backend = createBackend({
            connect: vi.fn(
                () =>
                    new Promise<void>((resolve) => {
                        resolveConnection = resolve;
                    }),
            ),
        });
        const controller = new AssetGenerationSettingsController({ backend });
        const connection = controller.connectWithApiKey("key");

        controller.setProvider("codex-cli");
        resolveConnection?.();
        await connection;

        expect(get(controller)).toMatchObject({
            providerId: "codex-cli",
            lifecycle: "disconnected",
            models: [],
        });
        expect(backend.listModels).not.toHaveBeenCalled();
        expect(controller.getReadySelection()).toBeUndefined();
    });

    it("authorizes a hosted subscription without returning provider credentials to the browser", async () => {
        const backend = createBackend({ hasPersistedVault: vi.fn(() => Promise.resolve(true)) });
        const controller = new AssetGenerationSettingsController({
            backend,
            pollIntervalMs: 0,
            wait: () => Promise.resolve(),
        });
        await controller.initialize();
        controller.setProvider("claude-cli");

        await controller.startHostedConnection();
        await vi.waitFor(() => expect(controller.getReadySelection()).toBeDefined());

        expect(backend.startHostedConnection).toHaveBeenCalledWith("claude");
        expect(backend.openAuthorizationUrl).toHaveBeenCalledWith("https://provider.example/authorize");
        expect(backend.getHostedConnectionStatus).toHaveBeenCalledWith("claude", "pairing-1");
        expect(backend.connect).toHaveBeenCalledWith("claude-cli", "workadventure-jwt");
        expect(controller.getReadySelection()).toEqual({ providerId: "claude-cli", modelId: "image-fast" });

        await controller.disconnect();
        expect(backend.disconnectHostedConnection).toHaveBeenCalledWith("claude");

        const browserVisibleState = JSON.stringify(get(controller));
        expect(browserVisibleState).not.toContain("provider-token");
        expect(browserVisibleState).not.toContain("workadventure-jwt");
    });

    it("completes a hosted authorization-code connection through the backend", async () => {
        const backend = createBackend({
            startHostedConnection: vi.fn(() =>
                Promise.resolve({
                    pairingId: "pairing-2",
                    authorizationUrl: "https://provider.example/authorize",
                    mode: "authorization-code" as const,
                }),
            ),
            getHostedConnectionStatus: vi.fn(() => new Promise<never>(() => undefined)),
        });
        const controller = new AssetGenerationSettingsController({
            backend,
            pollIntervalMs: 0,
            wait: () => Promise.resolve(),
        });
        controller.setProvider("claude-cli");

        await controller.startHostedConnection();
        await controller.completeHostedAuthorizationCode("oauth-code");

        expect(backend.completeHostedConnection).toHaveBeenCalledWith("claude", "pairing-2", "oauth-code");
        expect(backend.connect).toHaveBeenCalledWith("claude-cli", "workadventure-jwt");
        expect(controller.getReadySelection()).toEqual({ providerId: "claude-cli", modelId: "image-fast" });
    });

    it("removes the encrypted OpenRouter vault explicitly", async () => {
        const backend = createBackend({ hasPersistedVault: vi.fn(() => Promise.resolve(true)) });
        const controller = new AssetGenerationSettingsController({ backend });
        await controller.initialize();

        await controller.deleteVault();
        expect(backend.deleteVault).toHaveBeenCalledOnce();
        expect(get(controller)).toMatchObject({ vaultAvailable: false, lifecycle: "disconnected" });
    });
});
