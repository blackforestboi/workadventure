<script lang="ts">
    import { onMount } from "svelte";

    import { LL } from "../../../../i18n/i18n-svelte";
    import {
        RoomEditorAccessConflictError,
        roomEditorAccessApi,
        type RoomEditorAccessEditorInput,
        type RoomEditorAccessMode,
        type RoomEditorAccessResponse,
    } from "../../../Services/RoomEditorAccessApi";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import Button from "../../UI/Button.svelte";

    let configured = $state(false);
    let mode = $state<RoomEditorAccessMode>("everyone");
    let version = $state(0);
    let editors = $state<RoomEditorAccessEditorInput[]>([]);
    let identifier = $state("");
    let displayName = $state("");
    let isLoading = $state(true);
    let isSaving = $state(false);
    let loadError = $state(false);
    let saveError = $state(false);
    let conflict = $state(false);
    let addError = $state<"required" | "duplicate" | undefined>();
    let saved = $state(false);
    let savedFingerprint = $state("");
    let requestController: AbortController | undefined;

    function fingerprint(currentMode: RoomEditorAccessMode, currentEditors: RoomEditorAccessEditorInput[]): string {
        return JSON.stringify({
            mode: currentMode,
            editors: currentEditors.map((editor) => ({
                identifier: editor.identifier,
                displayName: editor.displayName ?? "",
            })),
        });
    }

    let hasChanges = $derived(fingerprint(mode, editors) !== savedFingerprint);
    let canSave = $derived(!isLoading && !isSaving && !conflict && (!configured || hasChanges));

    function applyResponse(response: RoomEditorAccessResponse): void {
        const nextEditors = response.editors.map((editor) => ({
            identifier: editor.identifier,
            displayName: editor.displayName || undefined,
        }));
        configured = response.configured;
        mode = response.mode;
        version = response.version;
        editors = nextEditors;
        savedFingerprint = fingerprint(response.mode, nextEditors);
    }

    onMount(() => {
        requestController = new AbortController();
        load(requestController.signal).catch((error: unknown) =>
            console.error("Could not initialize room editor access", error),
        );
        return () => requestController?.abort();
    });

    async function load(signal = requestController?.signal): Promise<void> {
        isLoading = true;
        loadError = false;
        saveError = false;
        conflict = false;
        saved = false;

        try {
            const response = await roomEditorAccessApi.get(gameManager.currentStartedRoom.href, signal);
            applyResponse(response);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            console.error("Could not load room editor access", error);
            loadError = true;
        } finally {
            isLoading = false;
        }
    }

    function addEditor(): void {
        const normalizedIdentifier = identifier.trim();
        const normalizedDisplayName = displayName.trim();
        if (normalizedIdentifier.length === 0) {
            addError = "required";
            return;
        }
        if (editors.some((editor) => editor.identifier === normalizedIdentifier)) {
            addError = "duplicate";
            return;
        }

        editors = [
            ...editors,
            {
                identifier: normalizedIdentifier,
                ...(normalizedDisplayName.length > 0 ? { displayName: normalizedDisplayName } : {}),
            },
        ];
        identifier = "";
        displayName = "";
        addError = undefined;
        saveError = false;
        saved = false;
    }

    function removeEditor(editorIdentifier: string): void {
        editors = editors.filter((editor) => editor.identifier !== editorIdentifier);
        saveError = false;
        saved = false;
    }

    function handleEditorInputKeydown(event: KeyboardEvent): void {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addEditor();
    }

    function handleModeChange(): void {
        saveError = false;
        saved = false;
    }

    async function save(): Promise<void> {
        if (!canSave) return;

        isSaving = true;
        saveError = false;
        conflict = false;
        saved = false;
        const requestedMode = mode;
        const requestedVersion = version;
        const requestedEditors = editors.map((editor) => ({
            identifier: editor.identifier,
            ...(editor.displayName ? { displayName: editor.displayName } : {}),
        }));
        try {
            const response = await roomEditorAccessApi.update(
                {
                    roomId: gameManager.currentStartedRoom.href,
                    mode: requestedMode,
                    expectedVersion: requestedVersion,
                    editors: requestedEditors,
                },
                requestController?.signal,
            );
            applyResponse(response);
            saved = true;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            if (error instanceof RoomEditorAccessConflictError) {
                conflict = true;
                return;
            }
            console.error("Could not save room editor access", error);
            saveError = true;
        } finally {
            isSaving = false;
        }
    }
</script>

<section class="flex flex-col gap-4" aria-labelledby="room-editor-access-title" aria-busy={isLoading || isSaving}>
    <div>
        <h3 id="room-editor-access-title" class="text-white">{$LL.mapEditor.settings.editorAccess.title()}</h3>
        <p class="text-sm opacity-80">{$LL.mapEditor.settings.editorAccess.description()}</p>
    </div>

    {#if isLoading}
        <p class="py-6 text-center" aria-live="polite">{$LL.mapEditor.settings.editorAccess.loading()}</p>
    {:else if loadError}
        <div
            class="flex flex-col items-start gap-3 rounded-lg border border-danger-900/50 bg-danger-900/20 p-4"
            role="alert"
        >
            <p>{$LL.mapEditor.settings.editorAccess.errors.load()}</p>
            <Button variant="contrast" appearance="border" size="sm" onclick={() => load()}>
                {$LL.mapEditor.settings.editorAccess.actions.retry()}
            </Button>
        </div>
    {:else}
        <form
            class="flex flex-col gap-5"
            onsubmit={async (event) => {
                event.preventDefault();
                await save();
            }}
        >
            {#if !configured}
                <p class="rounded-lg border border-warning-900/50 bg-warning-900/20 p-3 text-sm">
                    {$LL.mapEditor.settings.editorAccess.legacyNotice()}
                </p>
            {/if}

            <fieldset class="flex flex-col gap-2" disabled={isSaving}>
                <legend class="mb-2 font-semibold">{$LL.mapEditor.settings.editorAccess.modeLabel()}</legend>

                <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-white/30 p-3">
                    <input
                        class="mt-1"
                        type="radio"
                        name="room-editor-access-mode"
                        value="everyone"
                        bind:group={mode}
                        onchange={handleModeChange}
                    />
                    <span class="flex flex-col">
                        <span class="font-semibold">{$LL.mapEditor.settings.editorAccess.modes.everyone.title()}</span>
                        <span class="text-sm opacity-70"
                            >{$LL.mapEditor.settings.editorAccess.modes.everyone.description()}</span
                        >
                    </span>
                </label>

                <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-white/30 p-3">
                    <input
                        class="mt-1"
                        type="radio"
                        name="room-editor-access-mode"
                        value="specific"
                        bind:group={mode}
                        onchange={handleModeChange}
                    />
                    <span class="flex flex-col">
                        <span class="font-semibold">{$LL.mapEditor.settings.editorAccess.modes.specific.title()}</span>
                        <span class="text-sm opacity-70"
                            >{$LL.mapEditor.settings.editorAccess.modes.specific.description()}</span
                        >
                    </span>
                </label>

                <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-white/30 p-3">
                    <input
                        class="mt-1"
                        type="radio"
                        name="room-editor-access-mode"
                        value="nobody"
                        bind:group={mode}
                        onchange={handleModeChange}
                    />
                    <span class="flex flex-col">
                        <span class="font-semibold">{$LL.mapEditor.settings.editorAccess.modes.nobody.title()}</span>
                        <span class="text-sm opacity-70"
                            >{$LL.mapEditor.settings.editorAccess.modes.nobody.description()}</span
                        >
                    </span>
                </label>
            </fieldset>

            {#if mode === "specific"}
                <div class="flex flex-col gap-3 rounded-lg bg-black/20 p-4">
                    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <label class="flex flex-col gap-1">
                            <span class="text-sm font-semibold"
                                >{$LL.mapEditor.settings.editorAccess.identifier.label()}</span
                            >
                            <input
                                class="input-text"
                                type="text"
                                autocomplete="off"
                                placeholder={$LL.mapEditor.settings.editorAccess.identifier.placeholder()}
                                bind:value={identifier}
                                oninput={() => (addError = undefined)}
                                onkeydown={handleEditorInputKeydown}
                                disabled={isSaving}
                            />
                        </label>
                        <label class="flex flex-col gap-1">
                            <span class="text-sm font-semibold"
                                >{$LL.mapEditor.settings.editorAccess.displayName.label()}</span
                            >
                            <input
                                class="input-text"
                                type="text"
                                autocomplete="off"
                                placeholder={$LL.mapEditor.settings.editorAccess.displayName.placeholder()}
                                bind:value={displayName}
                                onkeydown={handleEditorInputKeydown}
                                disabled={isSaving}
                            />
                        </label>
                    </div>

                    {#if addError === "required"}
                        <p class="text-sm text-danger-800" role="alert">
                            {$LL.mapEditor.settings.editorAccess.errors.identifierRequired()}
                        </p>
                    {:else if addError === "duplicate"}
                        <p class="text-sm text-danger-800" role="alert">
                            {$LL.mapEditor.settings.editorAccess.errors.duplicateIdentifier()}
                        </p>
                    {/if}

                    <div>
                        <Button
                            type="button"
                            variant="contrast"
                            appearance="border"
                            size="sm"
                            onclick={addEditor}
                            disabled={isSaving}
                        >
                            {$LL.mapEditor.settings.editorAccess.actions.add()}
                        </Button>
                    </div>

                    {#if editors.length === 0}
                        <p class="text-sm opacity-70">{$LL.mapEditor.settings.editorAccess.emptySpecificList()}</p>
                    {:else}
                        <ul
                            class="flex flex-col gap-2"
                            aria-label={$LL.mapEditor.settings.editorAccess.editorListLabel()}
                        >
                            {#each editors as editor (editor.identifier)}
                                <li
                                    class="flex items-center justify-between gap-3 rounded-lg border border-white/20 p-3"
                                >
                                    <span class="min-w-0">
                                        {#if editor.displayName}
                                            <span class="block truncate font-semibold">{editor.displayName}</span>
                                        {/if}
                                        <span class="block break-all text-sm opacity-70">{editor.identifier}</span>
                                    </span>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        appearance="ghost"
                                        size="sm"
                                        onclick={() => removeEditor(editor.identifier)}
                                        disabled={isSaving}
                                        aria-label={$LL.mapEditor.settings.editorAccess.actions.remove({
                                            identifier: editor.identifier,
                                        })}
                                    >
                                        {$LL.mapEditor.settings.editorAccess.actions.removeLabel()}
                                    </Button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            {/if}

            <div class="flex flex-col gap-2 rounded-lg bg-white/5 p-3 text-sm">
                <p>{$LL.mapEditor.settings.editorAccess.adminNotice()}</p>
                <p>{$LL.mapEditor.settings.editorAccess.reconnectNotice()}</p>
            </div>

            <div aria-live="polite">
                {#if conflict}
                    <div
                        class="flex flex-col items-start gap-3 rounded-lg border border-warning-900/50 bg-warning-900/20 p-3"
                        role="alert"
                    >
                        <p>{$LL.mapEditor.settings.editorAccess.errors.conflict()}</p>
                        <Button variant="contrast" appearance="border" size="sm" type="button" onclick={() => load()}>
                            {$LL.mapEditor.settings.editorAccess.actions.reload()}
                        </Button>
                    </div>
                {:else if saveError}
                    <p class="text-danger-800" role="alert">{$LL.mapEditor.settings.editorAccess.errors.save()}</p>
                {:else if saved}
                    <p class="text-success-400">{$LL.mapEditor.settings.editorAccess.saved()}</p>
                {/if}
            </div>

            <div class="flex justify-end">
                <Button type="submit" variant="primary" disabled={!canSave}>
                    {isSaving
                        ? $LL.mapEditor.settings.editorAccess.actions.saving()
                        : $LL.mapEditor.settings.editorAccess.actions.save()}
                </Button>
            </div>
        </form>
    {/if}
</section>
