<script lang="ts">
    import { pendingMapChangesStore, refreshPromptStore } from "../Stores/RefreshPromptStore";
    import { LL } from "../../i18n/i18n-svelte";

    let timeToRefreshSeconds = $state($refreshPromptStore?.timeToRefresh ?? 30);
    const pendingMapChanges = $derived($pendingMapChangesStore);

    $effect(() => {
        if (pendingMapChanges > 0) {
            return;
        }
        const refreshInterval = setInterval(() => {
            if (timeToRefreshSeconds <= 0) {
                window.location.reload();
            } else {
                timeToRefreshSeconds--;
            }
        }, 1000);
        return () => clearInterval(refreshInterval);
    });
</script>

<div class="grid place-items-center h-dvh refresh min-w-full w-screen bg-contrast">
    <div class="px-10 py-80 flex items-center flex-col">
        <p class="test-class">{$LL.mapEditor.map.refreshPrompt()}</p>
        {#if pendingMapChanges > 0}
            <p class="pending-save-warning">
                {$LL.mapEditor.map.pendingChangesBeforeRefresh({ count: pendingMapChanges })}
            </p>
        {/if}
        <button
            type="button"
            class="light m-auto cursor-pointer px-3"
            onclick={(event) => {
                event.preventDefault();
                window.location.reload();
            }}
            >{pendingMapChanges > 0
                ? $LL.refreshPrompt.refresh()
                : `${$LL.refreshPrompt.refresh()} (${timeToRefreshSeconds})`}
        </button>
    </div>
</div>

<style>
    .refresh {
        pointer-events: auto;
        color: white;
        z-index: 10000 !important;
        position: absolute !important;
        font-family: "Roboto", sans-serif;
        p {
            font-size: xx-large;
        }
        .pending-save-warning {
            max-width: 48rem;
            color: #ffdb70;
            font-size: large;
            text-align: center;
        }
    }
</style>
