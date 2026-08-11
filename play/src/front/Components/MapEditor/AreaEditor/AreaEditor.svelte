<script lang="ts">
    import { mapEditorAreaModeStore, mapEditorSelectedAreaPreviewStore } from "../../../Stores/MapEditorStore";
    import AreaPropertiesEditor from "./AreaPropertiesEditor.svelte";
    import AreaEditorInstructions from "./AreaEditorInstructions.svelte";
</script>

<div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto" aria-label="Interactions editor">
    <header>
        <h2 class="m-0 text-xl font-semibold">Interactions</h2>
        <p class="m-0 mt-1 text-xs text-white/60">Draw a zone, then choose what happens inside it.</p>
    </header>

    {#if $mapEditorAreaModeStore === "ADD"}
        <div class="rounded-xl border border-secondary bg-secondary/10 p-3">
            <strong class="block text-sm">Draw an interaction zone</strong>
            <span class="text-xs text-white/60">Click and drag anywhere on the map.</span>
        </div>
        <AreaEditorInstructions />
    {/if}
    {#if $mapEditorAreaModeStore === "EDIT"}
        {#if $mapEditorSelectedAreaPreviewStore !== undefined}
            <AreaPropertiesEditor />
        {/if}
    {/if}
</div>

<style>
</style>
