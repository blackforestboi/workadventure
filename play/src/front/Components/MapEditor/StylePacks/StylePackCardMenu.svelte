<script lang="ts">
    import { tick } from "svelte";
    import LL from "../../../../i18n/i18n-svelte";
    import { IconMoreVertical } from "../../Icons";
    import {
        getStyleIdsContainingSource,
        mapEditorStyleStore,
        normalizeMapEditorStyleName,
        type MapEditorStyle,
        type MapEditorStyleAssetKind,
        type MapEditorStyleAssetMetadata,
        type MapEditorStyleSource,
    } from "../../../Stores/MapEditorStyleStore";

    interface Props {
        assetKind: MapEditorStyleAssetKind;
        source: MapEditorStyleSource;
        metadata: MapEditorStyleAssetMetadata;
        derivedFromAssetId?: string;
        disabled?: boolean;
        placementClass?: string;
        onCopied?: (style: MapEditorStyle) => void;
    }

    let {
        assetKind,
        source,
        metadata,
        derivedFromAssetId,
        disabled = false,
        placementClass = "right-1 top-1",
        onCopied,
    }: Props = $props();

    let open = $state(false);
    let menuState: "actions" | "targets" | "create" = $state("actions");
    let pendingTargetId = $state<string>();
    let failedTargetId = $state<string>();
    let error = $state("");
    let draftName = $state("");
    let successStyle = $state<MapEditorStyle>();
    let rootElement = $state<HTMLDivElement>();
    let triggerElement = $state<HTMLButtonElement>();
    let menuElement = $state<HTMLDivElement>();
    let nameElement = $state<HTMLInputElement>();

    const writableStyles = $derived($mapEditorStyleStore.styles.filter((style) => !style.readOnly));
    const containingStyleIds = $derived(
        new Set(getStyleIdsContainingSource($mapEditorStyleStore.entries, assetKind, source)),
    );

    $effect(() => {
        if (!open || typeof document === "undefined") return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!rootElement?.contains(event.target as Node)) closeMenu();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            closeMenu();
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer);
            document.removeEventListener("keydown", closeOnEscape);
        };
    });

    function styleLabel(style: MapEditorStyle): string {
        if (style.kind === "default") return $LL.mapEditor.stylePacks.defaultStyle();
        return style.name;
    }

    async function focusFirstMenuControl(): Promise<void> {
        await tick();
        menuElement?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled)")?.focus();
    }

    async function toggleMenu(): Promise<void> {
        open = !open;
        error = "";
        if (open) {
            menuState = "actions";
            await focusFirstMenuControl();
        }
    }

    function closeMenu(returnFocus = true): void {
        open = false;
        menuState = "actions";
        pendingTargetId = undefined;
        failedTargetId = undefined;
        error = "";
        draftName = "";
        if (returnFocus)
            tick()
                .then(() => triggerElement?.focus())
                .catch(() => undefined);
    }

    async function showTargets(): Promise<void> {
        menuState = "targets";
        error = "";
        await focusFirstMenuControl();
    }

    async function showCreate(): Promise<void> {
        menuState = "create";
        error = "";
        await tick();
        nameElement?.focus();
    }

    async function copyTo(style: MapEditorStyle): Promise<void> {
        pendingTargetId = style.id;
        failedTargetId = undefined;
        error = "";
        try {
            await mapEditorStyleStore.copyAsset({
                destinationStyleId: style.id,
                assetKind,
                source,
                metadata,
                derivedFromAssetId,
            });
            successStyle = style;
            onCopied?.(style);
            closeMenu();
        } catch (cause) {
            failedTargetId = style.id;
            error = cause instanceof Error ? cause.message : $LL.mapEditor.stylePacks.errors.copyFailed();
        } finally {
            pendingTargetId = undefined;
        }
    }

    function validateName(): string | undefined {
        const normalized = normalizeMapEditorStyleName(draftName);
        if (normalized.length === 0) return $LL.mapEditor.stylePacks.errors.nameRequired();
        if (normalized.length > 80) return $LL.mapEditor.stylePacks.errors.nameTooLong();
        if (
            $mapEditorStyleStore.styles.some(
                (style) => style.name.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
            )
        ) {
            return $LL.mapEditor.stylePacks.errors.nameTaken();
        }
        return undefined;
    }

    async function createAndCopy(event: SubmitEvent): Promise<void> {
        event.preventDefault();
        const validationError = validateName();
        if (validationError !== undefined) {
            error = validationError;
            return;
        }
        pendingTargetId = "new-style";
        error = "";
        try {
            const style = await mapEditorStyleStore.createStyle(draftName, false);
            await copyTo(style);
        } catch (cause) {
            error = cause instanceof Error ? cause.message : $LL.mapEditor.stylePacks.errors.createFailed();
        } finally {
            pendingTargetId = undefined;
        }
    }

    function viewCopiedStyle(): void {
        if (successStyle === undefined) return;
        mapEditorStyleStore.selectStyle(successStyle.id);
        successStyle = undefined;
    }
</script>

<!-- The wrapper must stop card-level selection while its nested menu controls handle all interaction. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
    bind:this={rootElement}
    class={`absolute z-20 ${placementClass}`}
    role="group"
    aria-label={$LL.mapEditor.stylePacks.assetActions({ name: metadata.name })}
    onpointerdown={(event) => event.stopPropagation()}
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => event.stopPropagation()}
>
    <button
        bind:this={triggerElement}
        type="button"
        class="grid min-h-8 min-w-8 place-items-center rounded-full border border-white/20 bg-black/75 text-white shadow hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary disabled:opacity-50"
        aria-label={$LL.mapEditor.stylePacks.moreActions({ name: metadata.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        onclick={toggleMenu}
        {disabled}
    >
        <IconMoreVertical aria-hidden="true" />
    </button>

    {#if open}
        <div
            bind:this={menuElement}
            class="absolute right-0 top-9 z-30 max-h-[min(360px,70vh)] w-60 overflow-y-auto rounded-xl border border-white/20 bg-[#172238] p-1.5 text-left text-xs shadow-xl"
            role="menu"
            aria-label={$LL.mapEditor.stylePacks.assetActions({ name: metadata.name })}
        >
            {#if menuState === "actions"}
                <button
                    type="button"
                    role="menuitem"
                    class="w-full rounded-lg px-3 py-2 text-left font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                    onclick={showTargets}
                >
                    {$LL.mapEditor.stylePacks.copyForStyle()}
                </button>
            {:else if menuState === "targets"}
                <div class="mb-1 flex items-center justify-between gap-2 px-1">
                    <button
                        type="button"
                        class="rounded px-2 py-1 hover:bg-white/10"
                        onclick={() => {
                            menuState = "actions";
                            focusFirstMenuControl().catch(() => undefined);
                        }}
                    >
                        ← {$LL.mapEditor.stylePacks.back()}
                    </button>
                    <button type="button" class="rounded px-2 py-1 hover:bg-white/10" onclick={() => closeMenu()}>
                        {$LL.mapEditor.stylePacks.cancel()}
                    </button>
                </div>
                <p class="mx-2 mb-1 mt-2 font-semibold">{$LL.mapEditor.stylePacks.chooseDestination()}</p>
                {#each writableStyles as style (style.id)}
                    {@const alreadyAdded =
                        style.id === $mapEditorStyleStore.activeStyleId || containingStyleIds.has(style.id)}
                    <button
                        type="button"
                        role="menuitem"
                        class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={alreadyAdded || pendingTargetId !== undefined}
                        onclick={() => copyTo(style)}
                    >
                        <span class="truncate">{styleLabel(style)}</span>
                        {#if alreadyAdded}
                            <span class="shrink-0 text-[10px]">{$LL.mapEditor.stylePacks.alreadyAdded()}</span>
                        {:else if pendingTargetId === style.id}
                            <span class="shrink-0 text-[10px]">{$LL.mapEditor.stylePacks.copying()}</span>
                        {/if}
                    </button>
                {/each}
                <button
                    type="button"
                    role="menuitem"
                    class="mt-1 w-full rounded-lg border-t border-white/10 px-3 py-2 text-left font-semibold hover:bg-white/10"
                    onclick={showCreate}
                    disabled={pendingTargetId !== undefined}
                >
                    {$LL.mapEditor.stylePacks.createNewStyle()}
                </button>
                {#if error !== ""}
                    <div class="m-2 rounded-lg border border-red-300/30 bg-red-950/30 p-2" role="alert">
                        <p class="m-0 text-red-100">{error}</p>
                        {#if failedTargetId !== undefined}
                            <button
                                type="button"
                                class="mt-1 underline underline-offset-2"
                                onclick={() => {
                                    const style = writableStyles.find((candidate) => candidate.id === failedTargetId);
                                    if (style !== undefined) copyTo(style).catch(() => undefined);
                                }}
                            >
                                {$LL.mapEditor.stylePacks.retry()}
                            </button>
                        {/if}
                    </div>
                {/if}
            {:else}
                <form class="p-2" onsubmit={createAndCopy}>
                    <button
                        type="button"
                        class="mb-2 rounded px-2 py-1 hover:bg-white/10"
                        onclick={showTargets}
                        disabled={pendingTargetId !== undefined}
                    >
                        ← {$LL.mapEditor.stylePacks.back()}
                    </button>
                    <label for={`copy-style-${source.key}`} class="block font-semibold">
                        {$LL.mapEditor.stylePacks.styleName()}
                    </label>
                    <input
                        bind:this={nameElement}
                        id={`copy-style-${source.key}`}
                        bind:value={draftName}
                        maxlength="80"
                        autocomplete="off"
                        disabled={pendingTargetId !== undefined}
                        aria-invalid={error !== ""}
                        class="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-2 py-1.5"
                    />
                    {#if error !== ""}<p class="mb-0 mt-1 text-red-100" role="alert">{error}</p>{/if}
                    <button
                        type="submit"
                        class="mt-2 w-full rounded-lg bg-secondary px-3 py-2 font-semibold disabled:opacity-50"
                        disabled={pendingTargetId !== undefined}
                    >
                        {pendingTargetId === "new-style"
                            ? $LL.mapEditor.stylePacks.copying()
                            : $LL.mapEditor.stylePacks.createAndCopy()}
                    </button>
                </form>
            {/if}
        </div>
    {/if}
</div>

{#if successStyle !== undefined}
    <div
        class="absolute bottom-1 left-1 right-1 z-10 flex items-center justify-between gap-2 rounded-lg bg-emerald-950/90 px-2 py-1 text-[10px] text-emerald-50 shadow"
        role="status"
        aria-live="polite"
    >
        <span class="truncate">{$LL.mapEditor.stylePacks.copiedTo({ style: styleLabel(successStyle) })}</span>
        <button
            type="button"
            class="shrink-0 font-semibold underline underline-offset-2"
            onclick={(event) => {
                event.stopPropagation();
                viewCopiedStyle();
            }}
        >
            {$LL.mapEditor.stylePacks.view()}
        </button>
    </div>
{/if}
