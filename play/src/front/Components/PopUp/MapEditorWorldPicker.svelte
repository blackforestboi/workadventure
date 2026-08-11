<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { IconLoader, IconMapEditor, IconPlus } from "@wa-icons";

    interface Props {
        onthisworld?: () => void;
        oncreatenew?: () => Promise<void>;
        onclose?: () => void;
    }

    let { onthisworld, oncreatenew, onclose }: Props = $props();
    let creatingWorld = $state(false);

    function openThisWorld(): void {
        onthisworld?.();
        onclose?.();
    }

    async function createNewWorld(): Promise<void> {
        if (creatingWorld || oncreatenew === undefined) return;
        creatingWorld = true;
        try {
            await oncreatenew();
        } finally {
            // The guard above prevents concurrent creation calls, so this always belongs to this request.
            // eslint-disable-next-line require-atomic-updates
            creatingWorld = false;
        }
    }
</script>

<nav
    class="min-w-48 rounded-md bg-contrast/90 p-1 text-white shadow-lg backdrop-blur-md"
    data-testid="map-editor-options"
    aria-label={$LL.actionbar.mapEditor()}
>
    <button
        type="button"
        class="flex w-full items-center gap-2 rounded p-2 text-left text-sm font-semibold transition-colors hover:bg-white/10"
        data-testid="map-editor-this-world"
        onclick={openThisWorld}
    >
        <IconMapEditor class="h-5 w-5" />
        {$LL.actionbar.mapEditorThisWorld()}
    </button>
    <button
        type="button"
        class="flex w-full items-center gap-2 rounded p-2 text-left text-sm font-semibold transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        data-testid="map-editor-create-new"
        disabled={creatingWorld}
        onclick={createNewWorld}
    >
        {#if creatingWorld}
            <IconLoader class="h-5 w-5 animate-spin" />
            {$LL.actionbar.mapEditorCreating()}
        {:else}
            <IconPlus class="h-5 w-5" />
            {$LL.actionbar.mapEditorCreateNew()}
        {/if}
    </button>
</nav>
