<script lang="ts">
    import { onMount } from "svelte";
    import type { VisualAssetAnimation } from "@workadventure/map-editor";
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
    import { teapotGeneratedAssetApi, type TeapotGeneratedAssetView } from "../../../Services/TeapotGeneratedAssetApi";
    import {
        IconBarrierBlock,
        IconCloudUpload,
        IconDoorExit,
        IconFlag,
        IconPlus,
        IconPointer,
        IconSparkles,
        IconTexture,
        IconTrash,
        IconWall,
    } from "../../Icons";
    import AssetGenerationPanel from "../../AssetGeneration/AssetGenerationPanel.svelte";
    import AnimatedAssetPreview from "../../AssetGeneration/AnimatedAssetPreview.svelte";
    import VegetationEditor from "../VegetationEditor/VegetationEditor.svelte";
    import TerrainSurfaceAssetEditor from "./TerrainSurfaceAssetEditor.svelte";
    import type { ApprovedTerrainSurfaceAsset } from "./TerrainSurfaceAssetTypes";
    import {
        getActiveAuthoringPathTool,
        getActiveTerrainModeId,
        getTerrainModeOptions,
        isAuthoringPathMode,
        isTerrainAssetBrowserMode,
        resolveTerrainModeBrushGid,
    } from "./FloorEditorModes";

    let assetName = $state("My terrain tile");
    let savedTilesets: TeapotTilesetView[] = $state([]);
    let assetBusy = $state(false);
    let assetError = $state("");
    let assetPanelOpen = $state(false);
    let assetPanelMode: "upload" | "generate" | "surface" | undefined = $state(undefined);
    let assetDropActive = $state(false);
    let searchTerm = $state("");
    let selectedFamilyId: string | undefined = $state(undefined);
    let vegetationMode = $state(false);
    let savedSurfaceAsset: TeapotGeneratedAssetView | undefined = $state(undefined);
    let singleTileAssets = $derived(
        savedTilesets.filter(
            (tileset) => (tileset.columns === 1 && tileset.rows === 1) || tileset.animation !== undefined,
        ),
    );
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

    function selectElevation(layer: string) {
        dispatchMapEditorFloorAction({ type: "select-elevation", layer });
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
        state: {
            toolMode: "tile" | "shape" | "elevation";
            selectedTerrainFamilyId?: string;
            selectedGid: number;
            tilesets: readonly MapEditorFloorTileset[];
        },
        layers: readonly { name: string }[],
    ) {
        const shapeFamily = BUILT_IN_TERRAIN_TILESET.groups.find(
            (group) => group.id === state.selectedTerrainFamilyId && group.autotile !== undefined,
        );
        if (layer !== "" && state.toolMode === "shape" && shapeFamily !== undefined) {
            selectLibraryShape(layer, shapeFamily, layers);
            return;
        }
        selectBrush(layer, resolveTerrainModeBrushGid(state.selectedGid, state.tilesets));
    }

    async function importTileset(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (file === undefined) return;
        await importTilesetFile(file);
    }

    async function dropTileset(event: DragEvent) {
        event.preventDefault();
        assetDropActive = false;
        const file = event.dataTransfer?.files[0];
        if (file === undefined) return;
        await importTilesetFile(file);
    }

    async function importTilesetFile(file: File) {
        if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
            assetError = "Choose a PNG, JPEG, or WebP image.";
            return;
        }
        try {
            await saveTileset(file, { source: "imported" });
        } catch {
            // saveTileset exposes the actionable error beside the import controls.
        }
    }

    async function saveTileset(
        blob: Blob,
        provenance: {
            source: "generated" | "imported";
            providerId?: string;
            modelId?: string;
            animation?: VisualAssetAnimation;
        },
    ) {
        assetBusy = true;
        assetError = "";
        try {
            const normalized = await normalizeTilesetRaster(blob, provenance.animation);
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

    async function saveSurfaceAsset(asset: ApprovedTerrainSurfaceAsset) {
        assetBusy = true;
        assetError = "";
        try {
            savedSurfaceAsset = await teapotGeneratedAssetApi.upload(asset.blob, assetName, "terrain-surface", {
                source: asset.source,
                providerId: asset.providerId,
                modelId: asset.modelId,
                surfaceGrid: {
                    columns: asset.gridColumns,
                    rows: asset.gridRows,
                    tilePixelSize: asset.tilePixelSize,
                },
            });
        } catch (error) {
            assetError = error instanceof Error ? error.message : "The terrain surface could not be saved.";
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
                animation: tileset.animation,
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
    <header class="flex min-h-7 items-center justify-between gap-3">
        <h2 class="m-0 text-xl font-semibold">Terrain</h2>
        {#if $mapEditorFloorStateStore !== undefined}
            <div class="flex min-w-0 items-center justify-end gap-1.5 text-right text-[11px]">
                <span
                    class="h-2 w-2 shrink-0 rounded-full {$mapEditorFloorStateStore.status === 'failed'
                        ? 'bg-red-400'
                        : 'bg-green-400'}"
                ></span>
                <strong class="truncate">
                    {$mapEditorFloorStateStore.status === "saving"
                        ? "Saving live…"
                        : $mapEditorFloorStateStore.status === "failed"
                          ? "Could not save"
                          : "All changes saved live"}
                </strong>
            </div>
        {/if}
    </header>

    {#if $mapEditorFloorStateStore === undefined}
        <p class="text-sm">Loading terrain…</p>
    {:else}
        {@const state = $mapEditorFloorStateStore}
        {@const terrainModes = getTerrainModeOptions(state.layers)}
        {@const activeTerrainModeId = getActiveTerrainModeId(
            terrainModes,
            state.selectedLayer,
            state.selectedGid,
            state.toolMode,
        )}
        {@const activeAuthoringPathTool = getActiveAuthoringPathTool(terrainModes, state.selectedLayer)}
        {#if state.error}<p class="m-0 text-sm text-red-300" role="alert">{state.error}</p>{/if}

        <div class="grid grid-cols-2 gap-2" role="group" aria-label="Terrain asset type">
            <button
                type="button"
                class="rounded-lg border px-3 py-2 text-sm font-semibold {vegetationMode
                    ? 'border-white/15 bg-black/20 text-white/65'
                    : 'border-secondary bg-secondary/15 ring-1 ring-secondary'}"
                aria-pressed={!vegetationMode}
                onclick={() => (vegetationMode = false)}>Surfaces</button
            >
            <button
                type="button"
                class="rounded-lg border px-3 py-2 text-sm font-semibold {vegetationMode
                    ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                    : 'border-white/15 bg-black/20 text-white/65'}"
                aria-pressed={vegetationMode}
                onclick={() => (vegetationMode = true)}>Vegetation</button
            >
        </div>

        {#if vegetationMode}
            <VegetationEditor />
        {:else}
            <div>
                <div class="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Terrain paint mode">
                    {#each terrainModes as mode (mode.id)}
                        <button
                            type="button"
                            class="group flex min-w-[70px] flex-1 basis-[70px] flex-col items-center gap-1.5 rounded-lg border px-1.5 py-2 text-center transition-colors {activeTerrainModeId ===
                            mode.id
                                ? 'border-secondary bg-secondary/15 text-white ring-1 ring-secondary'
                                : 'border-white/10 bg-black/20 text-white/65 hover:border-white/30 hover:bg-white/10 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35"
                            onclick={() => {
                                if (!isTerrainAssetBrowserMode(mode.id)) {
                                    searchTerm = "";
                                    assetPanelOpen = false;
                                    assetPanelMode = undefined;
                                }
                                if (mode.id === "eraser") {
                                    selectPaletteBrush(
                                        activeAuthoringPathTool === undefined ? state.selectedLayer : "",
                                        0,
                                        state.layers,
                                    );
                                    return;
                                }
                                if (mode.layer === undefined) return;
                                if (mode.id === "elevation") {
                                    selectElevation(mode.layer);
                                    return;
                                }
                                if (isAuthoringPathMode(mode.id)) selectBrush(mode.layer, 1);
                                else selectLayer(mode.layer, state, state.layers);
                            }}
                            disabled={mode.layer === undefined}
                            aria-pressed={activeTerrainModeId === mode.id}
                            aria-label={mode.layer === undefined
                                ? `${mode.label} layer unavailable`
                                : `Use ${mode.label} mode`}
                            title={mode.layer === undefined
                                ? `${mode.label} layer is not available on this map`
                                : mode.label}
                        >
                            <span
                                class="grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-black/25 text-xl group-hover:border-white/20"
                                aria-hidden="true"
                            >
                                {#if mode.id === "pointer"}
                                    <IconPointer />
                                {:else if mode.id === "eraser"}
                                    <IconTrash />
                                {:else if mode.id === "collision"}
                                    <IconBarrierBlock />
                                {:else if mode.id === "floor"}
                                    <IconTexture />
                                {:else if mode.id === "exit"}
                                    <IconDoorExit />
                                {:else if mode.id === "start"}
                                    <IconFlag />
                                {:else if mode.id === "elevation"}
                                    <span class="text-lg leading-none">▲</span>
                                {:else}
                                    <IconWall />
                                {/if}
                            </span>
                            <span class="text-[10px] font-semibold leading-3">{mode.label}</span>
                        </button>
                    {/each}
                </div>
            </div>

            {#if isTerrainAssetBrowserMode(activeTerrainModeId)}
                <div class="flex items-stretch gap-2">
                    <label class="sr-only" for="terrain-search">Search terrain tiles</label>
                    <input
                        id="terrain-search"
                        type="search"
                        bind:value={searchTerm}
                        placeholder="Search terrain…"
                        class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm placeholder:text-white/40"
                    />
                    <button
                        type="button"
                        class="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:border-white/35 hover:bg-white/15"
                        onclick={() => {
                            assetPanelOpen = !assetPanelOpen;
                            if (!assetPanelOpen) assetPanelMode = undefined;
                        }}
                        aria-expanded={assetPanelOpen}
                        aria-controls="terrain-asset-panel"
                    >
                        <IconPlus aria-hidden="true" />
                        Add asset
                    </button>
                </div>
            {/if}

            {#if activeTerrainModeId === "elevation"}
                <p
                    class="m-0 rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-xs leading-5 text-white/75"
                >
                    Hold and drag to raise the map-wide surface; whichever floor is visible on top becomes the hill
                    skin. Command-drag lowers; Shift-drag uses a wide area brush. Maximum height is 20 half-tile steps.
                </p>
            {/if}

            {#if isTerrainAssetBrowserMode(activeTerrainModeId) && assetPanelOpen}
                <section
                    id="terrain-asset-panel"
                    class="max-h-[46%] shrink-0 overflow-y-auto rounded-xl border border-white/15 bg-black/25 p-3"
                    aria-label="Add terrain asset"
                >
                    <div class="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            class="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-center {assetPanelMode ===
                            'upload'
                                ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                                : 'border-white/10 bg-black/20 hover:border-white/30 hover:bg-white/10'}"
                            onclick={() => (assetPanelMode = "upload")}
                            aria-pressed={assetPanelMode === "upload"}
                        >
                            <IconCloudUpload class="text-2xl" aria-hidden="true" />
                            <span class="text-xs font-semibold">Drop asset</span>
                        </button>
                        <button
                            type="button"
                            class="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-center {assetPanelMode ===
                            'generate'
                                ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                                : 'border-white/10 bg-black/20 hover:border-white/30 hover:bg-white/10'}"
                            onclick={() => (assetPanelMode = "generate")}
                            aria-pressed={assetPanelMode === "generate"}
                        >
                            <IconSparkles class="text-2xl" aria-hidden="true" />
                            <span class="text-xs font-semibold">Generate with AI</span>
                        </button>
                        <button
                            type="button"
                            class="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-center {assetPanelMode ===
                            'surface'
                                ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                                : 'border-white/10 bg-black/20 hover:border-white/30 hover:bg-white/10'}"
                            onclick={() => (assetPanelMode = "surface")}
                            aria-pressed={assetPanelMode === "surface"}
                        >
                            <IconTexture class="text-2xl" aria-hidden="true" />
                            <span class="text-xs font-semibold">Create surface</span>
                        </button>
                    </div>

                    {#if assetPanelMode !== undefined}
                        <div class="mt-3 flex flex-col gap-3">
                            <label class="text-xs" for="tileset-name">
                                {assetPanelMode === "surface" ? "Terrain surface name" : "Terrain tile name"}
                                <input
                                    id="tileset-name"
                                    bind:value={assetName}
                                    maxlength="80"
                                    class="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2"
                                />
                            </label>

                            {#if assetPanelMode === "upload"}
                                <label
                                    class="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-3 text-center transition-colors {assetDropActive
                                        ? 'border-secondary bg-secondary/15'
                                        : 'border-white/25 bg-black/20 hover:border-white/45 hover:bg-white/5'}"
                                    ondragenter={(event) => {
                                        event.preventDefault();
                                        assetDropActive = true;
                                    }}
                                    ondragover={(event) => event.preventDefault()}
                                    ondragleave={() => (assetDropActive = false)}
                                    ondrop={dropTileset}
                                >
                                    <IconCloudUpload class="text-2xl" aria-hidden="true" />
                                    <strong class="text-xs">Drop an image here</strong>
                                    <span class="text-[11px] text-white/50">or choose a PNG, JPEG, or WebP file</span>
                                    <input
                                        class="sr-only"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        onchange={importTileset}
                                        disabled={assetBusy}
                                    />
                                </label>
                                <p class="m-0 text-[11px] leading-4 text-white/50">
                                    Terrain assets are one seamless 32×32 tile. Use Objects for furniture and larger
                                    sprites.
                                </p>
                                {#if singleTileAssets.length > 0}
                                    <div>
                                        <p class="mb-2 mt-0 text-xs font-semibold">Saved terrain tiles</p>
                                        <div class="grid grid-cols-4 gap-2">
                                            {#each singleTileAssets as tileset (tileset.id)}
                                                <button
                                                    type="button"
                                                    class="rounded-lg border border-white/15 p-1 hover:border-white/40"
                                                    onclick={() => embedTileset(tileset)}
                                                    title={`Add ${tileset.name}`}
                                                >
                                                    <AnimatedAssetPreview
                                                        imageSource={tileset.url}
                                                        imageAlt={tileset.name}
                                                        animation={tileset.animation}
                                                        classNames="aspect-square w-full object-contain [image-rendering:pixelated]"
                                                    />
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            {:else if assetPanelMode === "generate"}
                                <AssetGenerationPanel
                                    target="tileset"
                                    title="Generate floor tiles"
                                    outputSize={{ width: 32, height: 32, pixelated: true }}
                                    promptGuidance="Describe one seamless, top-down 32px floor or terrain texture. Do not include furniture, props, borders, or multiple tiles."
                                    onAccept={({ blob, providerId, modelId, animation }) =>
                                        saveTileset(blob, { source: "generated", providerId, modelId, animation })}
                                />
                            {:else}
                                <TerrainSurfaceAssetEditor disabled={assetBusy} onApprove={saveSurfaceAsset} />
                                {#if savedSurfaceAsset !== undefined}
                                    <div class="rounded-lg border border-emerald-300/30 bg-emerald-950/20 p-3 text-xs">
                                        <strong class="text-emerald-100">Surface asset saved</strong>
                                        <p class="mb-0 mt-1 text-white/65">
                                            {savedSurfaceAsset.name} keeps a {savedSurfaceAsset.surfaceGrid
                                                ?.columns}×{savedSurfaceAsset.surfaceGrid?.rows} logical grid and the approved
                                            source resolution.
                                        </p>
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    {/if}
                    {#if assetError}<p class="mb-0 mt-3 text-sm text-red-300" role="alert">{assetError}</p>{/if}
                </section>
            {/if}

            {#if activeAuthoringPathTool !== undefined}
                <div class="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        class="flex min-w-0 flex-col items-center gap-2 rounded-lg border p-2 text-center {state.selectedGid !==
                        0
                            ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                            : 'border-white/10 hover:bg-white/10'}"
                        onclick={() => {
                            if (state.selectedGid === 0) selectBrush(state.selectedLayer, 1);
                        }}
                        aria-pressed={state.selectedGid !== 0}
                    >
                        {#if activeAuthoringPathTool.id === "collision"}
                            <span
                                class="h-10 w-10 shrink-0 rounded border border-blue-300/50 bg-[linear-gradient(45deg,#60a5fa88_25%,transparent_25%,transparent_75%,#60a5fa88_75%),linear-gradient(45deg,#60a5fa88_25%,transparent_25%,transparent_75%,#60a5fa88_75%)] bg-[length:12px_12px] bg-[position:0_0,6px_6px]"
                            ></span>
                        {:else if activeAuthoringPathTool.id === "exit"}
                            <span
                                class="h-10 w-10 shrink-0 rounded border border-amber-300/50 bg-[linear-gradient(45deg,#f59e0b88_25%,transparent_25%,transparent_75%,#f59e0b88_75%),linear-gradient(45deg,#f59e0b88_25%,transparent_25%,transparent_75%,#f59e0b88_75%)] bg-[length:12px_12px] bg-[position:0_0,6px_6px]"
                            ></span>
                        {:else}
                            <span
                                class="h-10 w-10 shrink-0 rounded border border-green-300/50 bg-[linear-gradient(45deg,#22c55e88_25%,transparent_25%,transparent_75%,#22c55e88_75%),linear-gradient(45deg,#22c55e88_25%,transparent_25%,transparent_75%,#22c55e88_75%)] bg-[length:12px_12px] bg-[position:0_0,6px_6px]"
                            ></span>
                        {/if}
                        <span
                            ><strong class="block text-xs">{activeAuthoringPathTool.addLabel}</strong><span
                                class="text-[10px] text-white/50">{activeAuthoringPathTool.addDescription}</span
                            ></span
                        >
                    </button>
                    <button
                        type="button"
                        class="flex min-w-0 flex-col items-center gap-2 rounded-lg border p-2 text-center {state.selectedGid ===
                        0
                            ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                            : 'border-white/10 hover:bg-white/10'}"
                        onclick={() => {
                            if (state.selectedGid !== 0) selectBrush(state.selectedLayer, 0);
                        }}
                        aria-pressed={state.selectedGid === 0}
                    >
                        <span
                            class="h-10 w-10 shrink-0 rounded border border-white/20 bg-[linear-gradient(45deg,#ffffff18_25%,transparent_25%,transparent_75%,#ffffff18_75%),linear-gradient(45deg,#ffffff18_25%,transparent_25%,transparent_75%,#ffffff18_75%)] bg-[length:12px_12px] bg-[position:0_0,6px_6px]"
                        ></span>
                        <span
                            ><strong class="block text-xs">{activeAuthoringPathTool.removeLabel}</strong><span
                                class="text-[10px] text-white/50">{activeAuthoringPathTool.removeDescription}</span
                            ></span
                        >
                    </button>
                </div>
            {:else}
                <div class="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
                    <section class="mb-4" aria-label="Built-in terrain library">
                        {#if selectedFamily === undefined}
                            <div class="mb-2 flex items-baseline justify-between gap-2">
                                <h3 class="m-0 truncate text-xs font-semibold">Terrain families</h3>
                                <span class="shrink-0 text-[10px] text-white/40">
                                    {BUILT_IN_TERRAIN_TILESET.groups.length} styles
                                </span>
                            </div>
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
                                                {#each group.autotile === undefined || group.id === "water" ? [group.previewTileId] : Object.values(group.autotile).slice(0, 6) as tileId (tileId)}
                                                    <span
                                                        class={group.autotile === undefined || group.id === "water"
                                                            ? "col-span-3 h-full"
                                                            : "h-full"}
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
                                                    >{group.terrainType}{group.id === "water"
                                                        ? " · underlay"
                                                        : group.autotile === undefined
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
                            <div class="mb-2 flex items-baseline justify-between gap-2">
                                <h3 class="m-0 truncate text-xs font-semibold">{selectedFamily.name}</h3>
                                <span class="shrink-0 text-[10px] text-white/40">
                                    {selectedFamily.displayTileIds.length} tiles
                                </span>
                            </div>
                            <p class="mb-3 mt-0 text-[11px] leading-4 text-white/55">{selectedFamily.description}</p>

                            {#if selectedFamily.autotile !== undefined}
                                <div class="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Terrain paint style">
                                    <button
                                        type="button"
                                        class="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left {state.toolMode ===
                                            'shape' && state.selectedTerrainFamilyId === selectedFamily.id
                                            ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                                            : 'border-white/15 bg-white/5 hover:bg-white/10'}"
                                        onclick={() => {
                                            if (
                                                state.toolMode !== "shape" ||
                                                state.selectedTerrainFamilyId !== selectedFamily.id
                                            )
                                                selectLibraryShape(state.selectedLayer, selectedFamily, state.layers);
                                        }}
                                        aria-pressed={state.toolMode === "shape" &&
                                            state.selectedTerrainFamilyId === selectedFamily.id}
                                    >
                                        <strong class="text-xs">Draw shape</strong>
                                        <span aria-hidden="true" class="shrink-0 text-lg">▱</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left {state.toolMode ===
                                        'tile'
                                            ? 'border-secondary bg-secondary/15 ring-1 ring-secondary'
                                            : 'border-white/15 bg-white/5 hover:bg-white/10'}"
                                        onclick={() => {
                                            if (state.toolMode !== "tile")
                                                selectBrush(state.selectedLayer, state.selectedGid);
                                        }}
                                        aria-pressed={state.toolMode === "tile"}
                                    >
                                        <strong class="text-xs">Paint tiles</strong>
                                        <span aria-hidden="true" class="shrink-0 text-lg">▦</span>
                                    </button>
                                </div>
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
                                            onclick={() =>
                                                selectLibraryBrush(state.selectedLayer, asset.tileId, state.layers)}
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
            {/if}
        {/if}
    {/if}
</div>
