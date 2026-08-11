<script lang="ts">
    import { onMount } from "svelte";
    import type { MapEditorFloorTileset } from "../../../Stores/MapEditorFloorStore";
    import { mapEditorFloorStateStore, dispatchMapEditorFloorAction } from "../../../Stores/MapEditorFloorStore";
    import {
        BUILT_IN_TERRAIN_ASSETS,
        BUILT_IN_TERRAIN_TILESET,
        type BuiltInTerrainAsset,
        type BuiltInTerrainGroup,
    } from "../../../Services/BuiltInTerrainCatalog";
    import { resolveBrushLayer } from "../../../Phaser/Game/MapEditor/Tools/FloorEditorCatalog";
    import { normalizeTilesetRaster } from "../../../Services/AssetGeneration/TilesetRasterNormalizer";
    import { teapotTilesetApi, type TeapotTilesetView } from "../../../Services/TeapotTilesetApi";
    import AssetGenerationPanel from "../../AssetGeneration/AssetGenerationPanel.svelte";

    let assetName = $state("My terrain tile");
    let savedTilesets: TeapotTilesetView[] = $state([]);
    let assetBusy = $state(false);
    let assetError = $state("");
    let searchTerm = $state("");
    let selectedFamilyId: string | undefined = $state(undefined);
    let singleTileAssets = $derived(savedTilesets.filter((tileset) => tileset.columns === 1 && tileset.rows === 1));
    let selectedFamily = $derived(BUILT_IN_TERRAIN_TILESET.groups.find((group) => group.id === selectedFamilyId));

    onMount(() => {
        let active = true;
        teapotTilesetApi
            .list()
            .then((items) => {
                if (active) savedTilesets = items;
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    });

    function selectBrush(layer: string, gid: number) {
        dispatchMapEditorFloorAction({ type: "select-brush", layer, gid });
    }

    function selectPaletteBrush(layer: string, gid: number, layers: readonly { name: string }[]) {
        dispatchMapEditorFloorAction({
            type: "select-brush",
            layer: resolveBrushLayer(
                layer,
                layers.map((candidate) => candidate.name),
            ),
            gid,
        });
    }

    function selectLibraryBrush(layer: string, tileId: number, layers: readonly { name: string }[]) {
        dispatchMapEditorFloorAction({
            type: "select-library-brush",
            layer: resolveBrushLayer(
                layer,
                layers.map((candidate) => candidate.name),
            ),
            tileId,
            tileset: {
                id: BUILT_IN_TERRAIN_TILESET.id,
                name: BUILT_IN_TERRAIN_TILESET.name,
                // Map documents are hosted on map-storage, so retain the Play origin with the image URL.
                url: new URL(BUILT_IN_TERRAIN_TILESET.image, window.location.origin).toString(),
                width: BUILT_IN_TERRAIN_TILESET.width,
                height: BUILT_IN_TERRAIN_TILESET.height,
            },
        });
    }

    function selectLibraryShape(layer: string, group: BuiltInTerrainGroup, layers: readonly { name: string }[]) {
        if (group.autotile === undefined) return;
        dispatchMapEditorFloorAction({
            type: "select-library-shape",
            layer: resolveBrushLayer(
                layer,
                layers.map((candidate) => candidate.name),
            ),
            familyId: group.id,
            autotile: group.autotile,
            tileset: {
                id: BUILT_IN_TERRAIN_TILESET.id,
                name: BUILT_IN_TERRAIN_TILESET.name,
                url: new URL(BUILT_IN_TERRAIN_TILESET.image, window.location.origin).toString(),
                width: BUILT_IN_TERRAIN_TILESET.width,
                height: BUILT_IN_TERRAIN_TILESET.height,
            },
        });
    }

    function selectLayer(
        layer: string,
        state: { toolMode: "tile" | "shape"; selectedTerrainFamilyId?: string; selectedGid: number },
        layers: readonly { name: string }[],
    ) {
        const shapeFamily = BUILT_IN_TERRAIN_TILESET.groups.find(
            (group) => group.id === state.selectedTerrainFamilyId && group.autotile !== undefined,
        );
        if (layer !== "" && state.toolMode === "shape" && shapeFamily !== undefined) {
            selectLibraryShape(layer, shapeFamily, layers);
            return;
        }
        selectBrush(layer, state.selectedGid);
    }

    async function importTileset(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (file === undefined) return;
        try {
            await saveTileset(file, { source: "imported" });
        } catch {
            // saveTileset exposes the actionable error beside the import controls.
        }
    }

    async function saveTileset(
        blob: Blob,
        provenance: { source: "generated" | "imported"; providerId?: string; modelId?: string },
    ) {
        assetBusy = true;
        assetError = "";
        try {
            const normalized = await normalizeTilesetRaster(blob);
            const saved = await teapotTilesetApi.upload(normalized, assetName, provenance);
            savedTilesets = [...savedTilesets.filter((candidate) => candidate.id !== saved.id), saved];
            embedTileset(saved);
        } catch (error) {
            assetError = error instanceof Error ? error.message : "The terrain tile could not be saved.";
            throw error;
        } finally {
            assetBusy = false;
        }
    }

    function embedTileset(tileset: TeapotTilesetView) {
        dispatchMapEditorFloorAction({
            type: "add-tileset",
            tileset: {
                id: tileset.id,
                name: tileset.name,
                url: tileset.url,
                width: tileset.width,
                height: tileset.height,
            },
        });
    }

    function tileStyle(gid: number, tilesets: readonly MapEditorFloorTileset[]): string {
        if (gid === 0) return "";
        const tileset = tilesets.find(
            (candidate) => gid >= candidate.firstGid && gid < candidate.firstGid + candidate.tileCount,
        );
        if (tileset === undefined) return "";
        const index = gid - tileset.firstGid;
        return atlasTileStyle(tileset.image, index, tileset.columns, tileset.rows);
    }

    function atlasTileStyle(image: string, tileId: number, columns: number, rows: number): string {
        const column = tileId % columns;
        const row = Math.floor(tileId / columns);
        const x = columns === 1 ? 0 : (column / (columns - 1)) * 100;
        const y = rows === 1 ? 0 : (row / (rows - 1)) * 100;
        return `background-image:url('${CSS.escape(image)}');background-position:${x}% ${y}%;background-size:${columns * 100}% ${rows * 100}%;background-repeat:no-repeat;image-rendering:pixelated;`;
    }

    function libraryTileGid(tilesets: readonly MapEditorFloorTileset[], tileId: number): number | undefined {
        const embedded = tilesets.find((tileset) => BUILT_IN_TERRAIN_TILESET.matchesImage(tileset.image));
        return embedded === undefined ? undefined : embedded.firstGid + tileId;
    }

    function groupTerrainAssets(group: BuiltInTerrainGroup, search: string): readonly BuiltInTerrainAsset[] {
        const queryTokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return group.displayTileIds
            .map((tileId) => BUILT_IN_TERRAIN_ASSETS.find((asset) => asset.tileId === tileId))
            .filter(
                (asset): asset is BuiltInTerrainAsset =>
                    asset !== undefined && queryTokens.every((token) => asset.searchText.includes(token)),
            );
    }

    function matchesFamily(group: BuiltInTerrainGroup, search: string): boolean {
        const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const haystack = `${group.name} ${group.description} ${group.terrainType} ${group.searchTerms}`.toLowerCase();
        return tokens.every((token) => haystack.includes(token));
    }
</script>

<div class="flex h-full min-h-0 flex-col gap-3" aria-label="Terrain editor">
    <header>
        <h2 class="m-0 text-xl font-semibold">Terrain</h2>
        <p class="m-0 mt-1 text-xs text-white/60">
            Choose a tile to paint, or clear the selection and drag the map to pan. Every stroke saves live for
            everyone.
        </p>
    </header>

    {#if $mapEditorFloorStateStore === undefined}
        <p class="text-sm">Loading terrain…</p>
    {:else}
        {@const state = $mapEditorFloorStateStore}
        <div class="grid grid-cols-[1fr_auto] items-end gap-2">
            <label class="text-xs font-medium" for="terrain-layer">
                Paint on
                <select
                    id="terrain-layer"
                    value={state.selectedLayer}
                    onchange={(event) => selectLayer(event.currentTarget.value, state, state.layers)}
                    class="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2"
                >
                    <option value="">No brush — drag to pan</option>
                    {#each state.layers as layer (layer.name)}
                        <option value={layer.name}>{layer.name}</option>
                    {/each}
                </select>
            </label>
            <div class="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-right text-[11px] leading-4">
                {#if state.hoveredTile}
                    <strong>Tile {state.hoveredTile.x}, {state.hoveredTile.y}</strong>
                {:else}
                    <strong>Move over the map</strong>
                {/if}
                <div class="text-white/50">
                    {state.status === "saving"
                        ? `${state.changedTiles} saving…`
                        : state.status === "failed"
                          ? "Save failed"
                          : "Saved live"}
                </div>
            </div>
        </div>

        <label class="sr-only" for="terrain-search">Search terrain tiles</label>
        <input
            id="terrain-search"
            type="search"
            bind:value={searchTerm}
            placeholder="Search terrain…"
            class="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm placeholder:text-white/40"
        />

        <div class="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
            <div class="mb-3">
                <p class="mb-1 mt-0 text-[11px] font-semibold uppercase tracking-wide text-white/50">Tools</p>
                <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-lg border p-2 text-left {state.selectedLayer !== '' &&
                    state.selectedGid === 0
                        ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                        : 'border-white/10 hover:bg-white/10'}"
                    onclick={() => selectPaletteBrush(state.selectedLayer, 0, state.layers)}
                    aria-pressed={state.selectedLayer !== "" && state.selectedGid === 0}
                >
                    <span
                        class="h-10 w-10 shrink-0 rounded border border-white/20 bg-[linear-gradient(45deg,#ffffff18_25%,transparent_25%,transparent_75%,#ffffff18_75%),linear-gradient(45deg,#ffffff18_25%,transparent_25%,transparent_75%,#ffffff18_75%)] bg-[length:12px_12px] bg-[position:0_0,6px_6px]"
                    ></span>
                    <span
                        ><strong class="block text-sm">Eraser</strong><span class="text-xs text-white/50"
                            >Remove tiles</span
                        ></span
                    >
                </button>
            </div>

            <section class="mb-4" aria-label="Built-in terrain library">
                <div class="mb-2 flex items-baseline justify-between gap-2">
                    <h3 class="m-0 truncate text-xs font-semibold">
                        {selectedFamily === undefined ? "Terrain families" : selectedFamily.name}
                    </h3>
                    <span class="shrink-0 text-[10px] text-white/40">
                        {selectedFamily === undefined
                            ? `${BUILT_IN_TERRAIN_TILESET.groups.length} styles`
                            : `${selectedFamily.displayTileIds.length} tiles`}
                    </span>
                </div>
                {#if selectedFamily === undefined}
                    <div class="grid grid-cols-2 gap-2">
                        {#each BUILT_IN_TERRAIN_TILESET.groups as group (group.id)}
                            {#if matchesFamily(group, searchTerm)}
                                <button
                                    type="button"
                                    class="group overflow-hidden rounded-xl border border-white/10 bg-black/25 text-left hover:border-white/35 hover:bg-white/10"
                                    onclick={() => {
                                        selectedFamilyId = group.id;
                                        searchTerm = "";
                                    }}
                                    aria-label={`Open ${group.name}. ${group.description}`}
                                >
                                    <span class="grid aspect-[3/2] grid-cols-3 overflow-hidden bg-black/30">
                                        {#each group.autotile === undefined ? [group.previewTileId] : Object.values(group.autotile).slice(0, 6) as tileId (tileId)}
                                            <span
                                                class={group.autotile === undefined ? "col-span-3 h-full" : "h-full"}
                                                style={atlasTileStyle(
                                                    BUILT_IN_TERRAIN_TILESET.image,
                                                    tileId,
                                                    BUILT_IN_TERRAIN_TILESET.columns,
                                                    BUILT_IN_TERRAIN_TILESET.rows,
                                                )}
                                            ></span>
                                        {/each}
                                    </span>
                                    <span class="block p-2">
                                        <strong class="block truncate text-xs">{group.name}</strong>
                                        <span class="mt-0.5 block text-[10px] capitalize text-white/45"
                                            >{group.terrainType}{group.autotile === undefined
                                                ? " · tiles"
                                                : " · shape ready"}</span
                                        >
                                    </span>
                                </button>
                            {/if}
                        {/each}
                    </div>
                {:else}
                    {@const terrainAssets = groupTerrainAssets(selectedFamily, searchTerm)}
                    <button
                        type="button"
                        class="mb-2 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10"
                        onclick={() => {
                            selectedFamilyId = undefined;
                            searchTerm = "";
                        }}>← All terrain</button
                    >
                    <p class="mb-3 mt-0 text-[11px] leading-4 text-white/55">{selectedFamily.description}</p>

                    {#if selectedFamily.autotile !== undefined}
                        <button
                            type="button"
                            class="mb-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left {state.toolMode ===
                                'shape' && state.selectedTerrainFamilyId === selectedFamily.id
                                ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                                : 'border-white/15 bg-white/5 hover:bg-white/10'}"
                            onclick={() => selectLibraryShape(state.selectedLayer, selectedFamily, state.layers)}
                            aria-pressed={state.toolMode === "shape" &&
                                state.selectedTerrainFamilyId === selectedFamily.id}
                        >
                            <span
                                ><strong class="block text-sm">Draw shape</strong><span
                                    class="text-[11px] text-white/50">Drag a rectangle on the map</span
                                ></span
                            >
                            <span aria-hidden="true" class="text-lg">▱</span>
                        </button>
                    {/if}

                    {#if terrainAssets.length > 0}
                        <p class="mb-1.5 mt-0 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                            Choose one tile
                        </p>
                        <div class="grid grid-cols-3 gap-1.5">
                            {#each terrainAssets as asset (asset.id)}
                                {@const gid = libraryTileGid(state.tilesets, asset.tileId)}
                                <button
                                    type="button"
                                    class="aspect-square min-h-11 overflow-hidden rounded-md border bg-black/30 {gid !==
                                        undefined &&
                                    state.selectedLayer !== '' &&
                                    state.selectedGid === gid &&
                                    state.toolMode === 'tile'
                                        ? 'border-secondary ring-2 ring-secondary/60'
                                        : 'border-white/10 hover:border-white/50 hover:bg-white/10'}"
                                    style={atlasTileStyle(
                                        BUILT_IN_TERRAIN_TILESET.image,
                                        asset.tileId,
                                        BUILT_IN_TERRAIN_TILESET.columns,
                                        BUILT_IN_TERRAIN_TILESET.rows,
                                    )}
                                    onclick={() => selectLibraryBrush(state.selectedLayer, asset.tileId, state.layers)}
                                    aria-label={`Select ${asset.name}. ${asset.description}${asset.solid ? " Solid: players cannot cross it." : ""}`}
                                    aria-pressed={gid !== undefined &&
                                        state.selectedLayer !== "" &&
                                        state.selectedGid === gid &&
                                        state.toolMode === "tile"}
                                    title={`${asset.name}\n${asset.description}\n${asset.solid ? "Solid: players cannot cross it." : "Walkable terrain."}`}
                                ></button>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-xs text-white/50">No matching tiles in this terrain.</p>
                    {/if}
                {/if}
            </section>

            {#each state.tilesets as tileset (`${tileset.firstGid}:${tileset.image}`)}
                {#if !BUILT_IN_TERRAIN_TILESET.matchesImage(tileset.image) && (searchTerm.trim() === "" || tileset.name
                            .toLowerCase()
                            .includes(searchTerm.trim().toLowerCase()))}
                    <section class="mb-4" aria-label={tileset.name}>
                        <div class="mb-2 flex items-baseline justify-between gap-2">
                            <h3 class="m-0 truncate text-xs font-semibold">{tileset.name}</h3>
                            <span class="shrink-0 text-[10px] text-white/40">
                                {tileset.tileGids.length}
                                {tileset.tileGids.length === 1 ? "tile" : "tiles"}
                            </span>
                        </div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5">
                            {#each tileset.tileGids as gid (gid)}
                                {@const index = gid - tileset.firstGid}
                                <button
                                    type="button"
                                    class="aspect-square min-h-11 overflow-hidden rounded-md border bg-black/30 {state.selectedLayer !==
                                        '' && state.selectedGid === gid
                                        ? 'border-secondary ring-2 ring-secondary/60'
                                        : 'border-white/10 hover:border-white/50 hover:bg-white/10'}"
                                    style={tileStyle(gid, state.tilesets)}
                                    onclick={() => selectPaletteBrush(state.selectedLayer, gid, state.layers)}
                                    aria-label={`Select ${tileset.name} tile ${index + 1}`}
                                    aria-pressed={state.selectedLayer !== "" && state.selectedGid === gid}
                                    title={`${tileset.name} · tile ${index + 1}`}
                                ></button>
                            {/each}
                        </div>
                    </section>
                {/if}
            {/each}
        </div>

        <details class="shrink-0 rounded-xl border border-white/10 bg-black/20 p-2">
            <summary class="cursor-pointer px-1 text-xs font-semibold">Add terrain assets</summary>
            <div class="mt-3 flex flex-col gap-3">
                <label class="text-xs" for="tileset-name">
                    Terrain tile name
                    <input
                        id="tileset-name"
                        bind:value={assetName}
                        maxlength="80"
                        class="mt-1 w-full rounded-lg bg-black/40 p-2"
                    />
                </label>
                <label
                    class="cursor-pointer rounded-lg border border-white/20 px-3 py-2 text-center text-xs hover:bg-white/10"
                >
                    Import image
                    <input
                        class="sr-only"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onchange={importTileset}
                        disabled={assetBusy}
                    />
                </label>
                <p class="m-0 text-[11px] leading-4 text-white/50">
                    Terrain assets are one seamless 32×32 tile. Use Objects for furniture and larger sprites.
                </p>
                {#if singleTileAssets.length > 0}
                    <div>
                        <p class="mb-2 text-xs font-semibold">Saved terrain tiles</p>
                        <div class="grid grid-cols-4 gap-2">
                            {#each singleTileAssets as tileset (tileset.id)}
                                <button
                                    type="button"
                                    class="rounded-lg border border-white/15 p-1 hover:border-white/40"
                                    onclick={() => embedTileset(tileset)}
                                    title={`Add ${tileset.name}`}
                                >
                                    <img
                                        src={tileset.url}
                                        alt={tileset.name}
                                        class="aspect-square w-full object-contain [image-rendering:pixelated]"
                                    />
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
                <details class="rounded-lg border border-white/10 p-2">
                    <summary class="cursor-pointer text-xs font-semibold">Generate a terrain tile</summary>
                    <div class="mt-2">
                        <AssetGenerationPanel
                            target="tileset"
                            title="Generate floor tiles"
                            outputSize={{ width: 32, height: 32, pixelated: true }}
                            promptGuidance="Describe one seamless, top-down 32px floor or terrain texture. Do not include furniture, props, borders, or multiple tiles."
                            onAccept={({ blob, providerId, modelId }) =>
                                saveTileset(blob, { source: "generated", providerId, modelId })}
                        />
                    </div>
                </details>
                {#if assetError}<p class="m-0 text-sm text-red-300" role="alert">{assetError}</p>{/if}
            </div>
        </details>

        <div class="shrink-0 rounded-xl border border-white/10 bg-black/30 p-3">
            <div class="flex items-center gap-2 text-xs">
                <span class="h-2 w-2 rounded-full {state.status === 'failed' ? 'bg-red-400' : 'bg-green-400'}"></span>
                <strong>
                    {state.status === "saving"
                        ? "Saving live…"
                        : state.status === "failed"
                          ? "Could not save"
                          : "All changes saved live"}
                </strong>
                <span class="ml-auto text-white/50">Cmd/Ctrl+Z to undo</span>
            </div>
            {#if state.error}<p class="mb-0 mt-2 text-sm text-red-300" role="alert">{state.error}</p>{/if}
        </div>
    {/if}
</div>
