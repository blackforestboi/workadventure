<script lang="ts">
    import type { EntityPrefab, VegetationCategory, VegetationPreset } from "@workadventure/map-editor";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { EditorToolName } from "../../../Phaser/Game/MapEditor/MapEditorModeManager";
    import { mapEditorEntityModeStore, mapEditorSelectedEntityPrefabStore } from "../../../Stores/MapEditorStore";
    import { mapEditorVegetationStore } from "../../../Stores/MapEditorVegetationStore";
    import { createStarterVegetationPreset, vegetationPrefabs } from "../../../Services/BuiltInVegetationCatalog";
    import { UpsertVegetationPresetFrontCommand } from "../../../Phaser/Game/MapEditor/Commands/Vegetation/VegetationPresetFrontCommand";

    let search = $state("");
    let category = $state<VegetationCategory | "all">("all");
    let prefabs = $state<EntityPrefab[]>([]);
    let selectedSpecies: EntityPrefab[] = $state([]);
    let density = $state(0.45);
    let minimumSpacing = $state(1.5);
    let presetName = $state("My vegetation mix");
    let currentPreset = $state<VegetationPreset>();

    const manager = gameManager.getCurrentGameScene().getEntitiesCollectionsManager();
    const unsubscribe = manager.getEntitiesPrefabsStore().subscribe((items) => (prefabs = vegetationPrefabs(items)));
    $effect(() => () => unsubscribe());

    let filtered = $derived(
        prefabs.filter(
            (prefab) =>
                (category === "all" || prefab.vegetation?.category === category) &&
                (search.trim() === "" ||
                    `${prefab.name} ${prefab.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())),
        ),
    );

    function place(prefab: EntityPrefab) {
        gameManager
            .getCurrentGameScene()
            .getMapEditorModeManager()
            .equipTool(EditorToolName.EntityEditor, EditorToolName.FloorEditor);
        mapEditorSelectedEntityPrefabStore.set($state.snapshot(prefab));
        mapEditorEntityModeStore.set("ADD");
        mapEditorVegetationStore.set({ status: "placing" });
    }

    function toggleSpecies(prefab: EntityPrefab) {
        selectedSpecies = selectedSpecies.some(({ id }) => id === prefab.id)
            ? selectedSpecies.filter(({ id }) => id !== prefab.id)
            : [...selectedSpecies, prefab];
    }

    async function savePreset() {
        if (selectedSpecies.length === 0) return;
        const draft: VegetationPreset = {
            version: 1,
            id: currentPreset?.id ?? `vegetation-${crypto.randomUUID()}`,
            name: presetName.trim() || "Vegetation mix",
            revision: currentPreset?.revision ?? 0,
            density,
            minimumSpacing,
            species: selectedSpecies.map((prefab) => ({
                prefabRef: { collectionName: prefab.collectionName, id: prefab.id },
                weight: 1,
            })),
        };
        const scene = gameManager.getCurrentGameScene();
        const wamFile = scene.getGameMap().getWamFile();
        if (wamFile === undefined) return;
        const command = new UpsertVegetationPresetFrontCommand(
            wamFile.getWam(),
            draft,
            currentPreset?.revision ?? 0,
            undefined,
            wamFile.getLastCommandId(),
        );
        await scene.getMapEditorModeManager().executeCommand(command);
        // eslint-disable-next-line require-atomic-updates
        currentPreset = command.preset;
        scene.getMapEditorModeManager().equipTool(EditorToolName.FloorEditor);
        mapEditorVegetationStore.set({
            status: "selecting",
            selectedPreset: $state.snapshot(command.preset),
            selectionMode: true,
        });
    }

    function useStarter(id: "forest" | "grassland") {
        const preset = createStarterVegetationPreset(id, prefabs);
        if (preset === undefined) return;
        const editableCopy = { ...preset, id: `vegetation-${crypto.randomUUID()}`, revision: 0 };
        currentPreset = editableCopy;
        presetName = editableCopy.name;
        density = editableCopy.density;
        minimumSpacing = editableCopy.minimumSpacing;
        selectedSpecies = prefabs.filter((prefab) =>
            editableCopy.species.some((entry) => entry.prefabRef.id === prefab.id),
        );
        mapEditorVegetationStore.set({ status: "selecting", selectedPreset: editableCopy });
    }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3" aria-label="Vegetation editor">
    <div class="grid grid-cols-2 gap-2">
        <button
            type="button"
            class="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
            onclick={() => useStarter("forest")}>Forest</button
        >
        <button
            type="button"
            class="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
            onclick={() => useStarter("grassland")}>Grassland</button
        >
    </div>
    <fieldset class="rounded-lg border border-white/10 p-3">
        <legend class="px-1 text-xs font-semibold">Area mix</legend>
        <label class="block text-xs"
            >Name<input
                class="mt-1 w-full rounded border border-white/10 bg-black/30 p-2"
                bind:value={presetName}
            /></label
        >
        <div class="mt-2 grid grid-cols-2 gap-2">
            <label class="text-xs"
                >Density<input
                    class="mt-1 w-full"
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    bind:value={density}
                /></label
            >
            <label class="text-xs"
                >Spacing<input
                    class="mt-1 w-full"
                    type="number"
                    min="0"
                    max="16"
                    step="0.5"
                    bind:value={minimumSpacing}
                /></label
            >
        </div>
        <button
            type="button"
            class="mt-3 w-full rounded-lg bg-secondary px-3 py-2 text-sm font-semibold disabled:opacity-40"
            disabled={selectedSpecies.length === 0}
            onclick={() => savePreset().catch((error) => console.error(error))}>Save mix and place area</button
        >
        {#if $mapEditorVegetationStore.selectionMode}
            <p class="mb-0 mt-2 text-xs text-secondary">Drag a rectangle on the map to place this mix.</p>
        {/if}
    </fieldset>
    {#if $mapEditorVegetationStore.status === "planning" || $mapEditorVegetationStore.status === "saving"}
        <p class="m-0 text-xs text-secondary" aria-live="polite">Placing vegetation…</p>
    {/if}
    {#if $mapEditorVegetationStore.error}<p class="m-0 text-sm text-red-300" role="alert">
            {$mapEditorVegetationStore.error}
        </p>{/if}
    <div class="flex gap-2">
        <input
            class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm"
            type="search"
            bind:value={search}
            placeholder="Search vegetation…"
            aria-label="Search vegetation"
        />
        <select
            class="rounded-lg border border-white/10 bg-black/35 px-2 text-sm"
            bind:value={category}
            aria-label="Vegetation category"
        >
            <option value="all">All</option><option value="tree">Trees</option><option value="bush">Bushes</option
            ><option value="grass">Grass</option><option value="other">Other</option>
        </select>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto" data-testid="vegetation-list">
        {#if prefabs.length === 0}
            <p class="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/60">
                No vegetation yet. Generate or upload an object, mark it as vegetation, then it will appear here.
            </p>
        {:else if filtered.length === 0}
            <p class="text-sm text-white/60">No vegetation matches this search.</p>
        {:else}
            <div class="grid grid-cols-3 gap-2 pr-1">
                {#each filtered as prefab (prefab.id)}
                    <article class="rounded-lg border border-white/10 bg-black/20 p-2">
                        <img
                            class="aspect-square w-full object-contain [image-rendering:pixelated]"
                            src={prefab.imagePath}
                            alt={prefab.name}
                        />
                        <strong class="block truncate text-xs">{prefab.name}</strong>
                        <div class="mt-2 flex gap-1">
                            <button
                                type="button"
                                class="flex-1 rounded border border-white/15 px-1 py-1 text-[10px] hover:bg-white/10"
                                onclick={() => place(prefab)}>Place</button
                            >
                            <button
                                type="button"
                                class="rounded border px-1.5 py-1 text-[10px] {selectedSpecies.some(
                                    ({ id }) => id === prefab.id,
                                )
                                    ? 'border-secondary bg-secondary/20'
                                    : 'border-white/15'}"
                                onclick={() => toggleSpecies(prefab)}
                                aria-pressed={selectedSpecies.some(({ id }) => id === prefab.id)}>Mix</button
                            >
                        </div>
                    </article>
                {/each}
            </div>
        {/if}
    </div>
</section>
