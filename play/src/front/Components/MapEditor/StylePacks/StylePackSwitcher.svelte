<script lang="ts">
    import { onMount, tick } from "svelte";
    import LL from "../../../../i18n/i18n-svelte";
    import { configureMapEditorStyleStoreForCurrentUser } from "../../../Services/TeapotMapEditorStyleAdapter";
    import {
        BUILT_IN_MAP_STYLE_ID,
        DEFAULT_MAP_STYLE_ID,
        mapEditorStyleStore,
        normalizeMapEditorStyleName,
        type MapEditorStyle,
    } from "../../../Stores/MapEditorStyleStore";

    interface Props {
        id?: string;
        compact?: boolean;
    }

    let { id = "map-editor-style", compact = false }: Props = $props();
    let creating = $state(false);
    let draftName = $state("");
    let error = $state("");
    let pending = $state(false);
    let selectElement = $state<HTMLSelectElement>();
    let nameElement = $state<HTMLInputElement>();

    const customStyles = $derived($mapEditorStyleStore.styles.filter((style) => style.kind === "custom"));

    onMount(() => {
        configureMapEditorStyleStoreForCurrentUser();
        mapEditorStyleStore.hydrate().catch(() => undefined);
    });

    function finishStyleCreation(): void {
        creating = false;
        draftName = "";
    }

    function styleLabel(style: MapEditorStyle): string {
        if (style.id === DEFAULT_MAP_STYLE_ID) return $LL.mapEditor.stylePacks.defaultStyle();
        if (style.id === BUILT_IN_MAP_STYLE_ID) return $LL.mapEditor.stylePacks.builtIn();
        return style.name;
    }

    async function handleSelection(event: Event): Promise<void> {
        const value = (event.currentTarget as HTMLSelectElement).value;
        if (value !== "new-style") {
            mapEditorStyleStore.selectStyle(value);
            return;
        }
        creating = true;
        error = "";
        await tick();
        nameElement?.focus();
    }

    function validateName(): string | undefined {
        const normalized = normalizeMapEditorStyleName(draftName);
        if (normalized.length === 0) return $LL.mapEditor.stylePacks.errors.nameRequired();
        if (normalized.length > 80) return $LL.mapEditor.stylePacks.errors.nameTooLong();
        if (customStyles.some((style) => style.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
            return $LL.mapEditor.stylePacks.errors.nameTaken();
        }
        return undefined;
    }

    async function saveStyle(event: SubmitEvent): Promise<void> {
        event.preventDefault();
        const validationError = validateName();
        if (validationError !== undefined) {
            error = validationError;
            return;
        }
        pending = true;
        error = "";
        try {
            await mapEditorStyleStore.createStyle(draftName);
            finishStyleCreation();
            await tick();
            selectElement?.focus();
        } catch (cause) {
            error = cause instanceof Error ? cause.message : $LL.mapEditor.stylePacks.errors.createFailed();
        } finally {
            pending = false;
        }
    }

    async function cancelCreate(): Promise<void> {
        creating = false;
        error = "";
        draftName = "";
        await tick();
        selectElement?.focus();
    }
</script>

<section class="flex min-w-0 flex-col gap-1.5" aria-label={$LL.mapEditor.stylePacks.label()}>
    <div class="flex min-w-0 items-center gap-2">
        <label for={id} class="shrink-0 text-xs font-semibold">{$LL.mapEditor.stylePacks.label()}</label>
        <select
            bind:this={selectElement}
            {id}
            value={$mapEditorStyleStore.activeStyleId}
            onchange={handleSelection}
            disabled={$mapEditorStyleStore.status === "loading" || pending}
            aria-describedby={`${id}-status`}
            class="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/35 px-2 {compact
                ? 'py-1.5 text-xs'
                : 'py-2 text-sm'} disabled:cursor-wait disabled:opacity-60"
        >
            {#each $mapEditorStyleStore.styles as style (style.id)}
                <option value={style.id}>{styleLabel(style)}</option>
            {/each}
            <option value="new-style">{$LL.mapEditor.stylePacks.newStyle()}</option>
        </select>
    </div>

    <div id={`${id}-status`} class="min-h-4 text-[11px] leading-4" aria-live="polite">
        {#if $mapEditorStyleStore.status === "loading"}
            <span class="text-white/55">{$LL.mapEditor.stylePacks.loading()}</span>
        {:else if $mapEditorStyleStore.error !== undefined}
            <span class="text-red-200" role="alert">{$mapEditorStyleStore.error}</span>
            <button
                type="button"
                class="ml-2 underline underline-offset-2"
                onclick={() => mapEditorStyleStore.hydrate(true)}
            >
                {$LL.mapEditor.stylePacks.retry()}
            </button>
        {:else if $mapEditorStyleStore.notice !== undefined}
            <span class="text-amber-100">{$mapEditorStyleStore.notice}</span>
            <button
                type="button"
                class="ml-2 underline underline-offset-2"
                onclick={() => mapEditorStyleStore.clearNotice()}
            >
                {$LL.mapEditor.stylePacks.dismiss()}
            </button>
        {/if}
    </div>

    {#if creating}
        <form class="rounded-lg border border-white/15 bg-black/25 p-2" onsubmit={saveStyle}>
            <label for={`${id}-name`} class="block text-xs font-semibold">
                {$LL.mapEditor.stylePacks.styleName()}
            </label>
            <input
                bind:this={nameElement}
                id={`${id}-name`}
                bind:value={draftName}
                maxlength="80"
                autocomplete="off"
                disabled={pending}
                aria-invalid={error !== ""}
                aria-describedby={error === "" ? undefined : `${id}-name-error`}
                class="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm"
            />
            {#if error !== ""}
                <p id={`${id}-name-error`} class="mb-0 mt-1 text-xs text-red-200" role="alert">{error}</p>
            {/if}
            <div class="mt-2 flex justify-end gap-2">
                <button
                    type="button"
                    class="rounded-lg px-3 py-1.5 text-xs hover:bg-white/10"
                    onclick={cancelCreate}
                    disabled={pending}
                >
                    {$LL.mapEditor.stylePacks.cancel()}
                </button>
                <button
                    type="submit"
                    class="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={pending}
                >
                    {pending ? $LL.mapEditor.stylePacks.saving() : $LL.mapEditor.stylePacks.save()}
                </button>
            </div>
        </form>
    {/if}
</section>
