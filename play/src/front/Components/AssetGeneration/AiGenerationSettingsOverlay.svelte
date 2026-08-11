<script lang="ts">
    import { onMount } from "svelte";

    import { assetGenerationSettings } from "../../Services/AssetGeneration/AssetGenerationSettings";
    import { aiGenerationSettingsVisibilityStore } from "../../Stores/AiGenerationSettingsVisibilityStore";
    import Button from "../UI/Button.svelte";

    let apiKey = $state("");
    let sessionCredential = $state("");
    let saveEncrypted = $state(false);
    let newVaultPassphrase = $state("");
    let savedVaultPassphrase = $state("");
    let confirmVaultDeletion = $state(false);

    const busy = $derived($assetGenerationSettings.lifecycle === "connecting");
    const pendingCredential = $derived(apiKey || sessionCredential);

    onMount(() => {
        assetGenerationSettings.initialize().catch(() => undefined);
    });

    function close(): void {
        confirmVaultDeletion = false;
        apiKey = "";
        sessionCredential = "";
        newVaultPassphrase = "";
        savedVaultPassphrase = "";
        aiGenerationSettingsVisibilityStore.close();
    }

    function handleKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape" && $aiGenerationSettingsVisibilityStore) close();
    }

    async function verifyOpenRouterKey(credential = apiKey): Promise<void> {
        const normalizedCredential = credential.trim();
        if (normalizedCredential === "" || busy) return;

        apiKey = normalizedCredential;
        sessionCredential = normalizedCredential;
        const shouldPersist = saveEncrypted && newVaultPassphrase !== "";
        await assetGenerationSettings.connectWithApiKey(
            normalizedCredential,
            shouldPersist ? { passphrase: newVaultPassphrase, label: "OpenRouter" } : undefined,
        );
        if ($assetGenerationSettings.lifecycle === "connected") {
            apiKey = "";
            if (shouldPersist) {
                sessionCredential = "";
                newVaultPassphrase = "";
            }
        }
    }

    function handleApiKeyPaste(event: ClipboardEvent): void {
        const pastedKey = event.clipboardData?.getData("text").trim();
        if (!pastedKey) return;
        event.preventDefault();
        apiKey = pastedKey;
        void verifyOpenRouterKey(pastedKey);
    }

    async function reconnectSaved(): Promise<void> {
        const passphrase = savedVaultPassphrase;
        savedVaultPassphrase = "";
        await assetGenerationSettings.reconnectSavedCredential(passphrase);
    }

    async function deleteSavedVault(): Promise<void> {
        await assetGenerationSettings.deleteVault();
        confirmVaultDeletion = false;
    }

    function disconnect(): void {
        apiKey = "";
        sessionCredential = "";
        newVaultPassphrase = "";
        void assetGenerationSettings.disconnect();
    }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if $aiGenerationSettingsVisibilityStore}
    <div class="fixed inset-0 z-[2400] flex items-center justify-center p-3 pointer-events-auto">
        <button
            type="button"
            class="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
            aria-label="Close AI generation settings"
            onclick={close}
        ></button>
        <div
            class="relative z-10 flex max-h-[92dvh] w-full max-w-[550px] flex-col overflow-hidden rounded-xl border border-white/15 bg-contrast text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-generation-settings-title"
        >
            <header class="flex items-start justify-between gap-3 border-b border-white/15 p-4">
                <div>
                    <h2 id="ai-generation-settings-title" class="text-lg font-bold">AI generation settings</h2>
                    <p class="mt-1 text-xs text-white/65">
                        Your OpenRouter key is shared by avatar, map, floor, and proposal editors.
                    </p>
                </div>
                <Button appearance="ghost" variant="light" size="sm" onclick={close} aria-label="Close settings"
                    >Close</Button
                >
            </header>

            <div class="min-h-0 overflow-y-auto p-4">
                <div class="grid gap-3">
                    <label class="text-sm font-semibold">
                        <span class="flex flex-wrap items-center justify-between gap-2">
                            <span>OpenRouter API key</span>
                            {#if busy}
                                <span class="text-xs text-white/60">Checking…</span>
                            {:else if $assetGenerationSettings.lifecycle === "connected"}
                                <span class="text-xs text-green-300">Active</span>
                            {:else if $assetGenerationSettings.error}
                                <span class="text-xs font-normal text-red-300" role="alert">
                                    {$assetGenerationSettings.error}
                                </span>
                            {/if}
                        </span>
                        <input
                            bind:value={apiKey}
                            type="password"
                            autocomplete="off"
                            placeholder={$assetGenerationSettings.lifecycle === "connected"
                                ? "Paste a different key to replace the active key"
                                : "Paste your OpenRouter API key"}
                            class="mt-1 w-full rounded border border-white/15 bg-black/35 p-2 font-normal"
                            disabled={busy}
                            onpaste={handleApiKeyPaste}
                            onchange={() => void verifyOpenRouterKey()}
                        />
                    </label>
                    <div>
                        <label class="flex items-center gap-2 text-sm">
                            <input bind:checked={saveEncrypted} type="checkbox" disabled={busy} />
                            Save this key encrypted in this browser
                        </label>
                        {#if !saveEncrypted}
                            <p class="mt-1 pl-6 text-xs text-white/60">
                                Otherwise, the key is kept only for this browser session and must be entered again next
                                time.
                            </p>
                        {/if}
                    </div>
                    {#if saveEncrypted}
                        <label class="text-sm font-semibold">
                            Set password
                            <input
                                bind:value={newVaultPassphrase}
                                type="password"
                                autocomplete="new-password"
                                class="mt-1 w-full rounded border border-white/15 bg-black/35 p-2 font-normal"
                                disabled={busy}
                            />
                            <span class="mt-1 block text-xs font-normal text-white/55">
                                The password is never stored. Losing it makes the encrypted key unrecoverable.
                            </span>
                        </label>
                    {/if}
                    {#if $assetGenerationSettings.lifecycle === "connected"}
                        <div class="flex gap-2">
                            {#if saveEncrypted}
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onclick={() => void verifyOpenRouterKey(pendingCredential)}
                                    disabled={busy || pendingCredential === "" || newVaultPassphrase === ""}
                                    >Encrypt</Button
                                >
                            {/if}
                            <Button appearance="border" size="sm" onclick={disconnect}>Disconnect</Button>
                        </div>
                    {/if}
                </div>

                {#if $assetGenerationSettings.providerId === "openrouter" && $assetGenerationSettings.vaultAvailable}
                    <div class="mt-5 border-t border-white/15 pt-5">
                        <h3 class="font-semibold">Encrypted browser vault</h3>
                        <p class="mt-1 text-xs text-white/60">Unlock the saved key only for this browser session.</p>
                        {#if $assetGenerationSettings.lifecycle !== "connected"}
                            <label class="mt-3 block text-sm font-semibold">
                                Vault passphrase
                                <input
                                    bind:value={savedVaultPassphrase}
                                    type="password"
                                    autocomplete="current-password"
                                    class="mt-1 w-full rounded border border-white/15 bg-black/35 p-2 font-normal"
                                    disabled={busy}
                                />
                            </label>
                            <div class="mt-3">
                                <Button
                                    appearance="border"
                                    size="sm"
                                    onclick={reconnectSaved}
                                    disabled={busy || savedVaultPassphrase === ""}>Use saved key</Button
                                >
                            </div>
                        {/if}
                        <div class="mt-4 rounded-lg border border-red-300/20 p-3">
                            {#if confirmVaultDeletion}
                                <p class="mb-3 text-sm text-red-200">Delete the encrypted API key from this browser?</p>
                                <div class="flex gap-2">
                                    <Button variant="danger" size="sm" onclick={deleteSavedVault}>Delete vault</Button>
                                    <Button appearance="border" size="sm" onclick={() => (confirmVaultDeletion = false)}
                                        >Cancel</Button
                                    >
                                </div>
                            {:else}
                                <Button
                                    variant="danger"
                                    appearance="border"
                                    size="sm"
                                    onclick={() => (confirmVaultDeletion = true)}>Remove saved key</Button
                                >
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
