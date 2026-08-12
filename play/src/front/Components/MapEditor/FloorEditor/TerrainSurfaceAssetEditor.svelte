<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import type { AssetGenerationReference } from "../../../Services/AssetGeneration/AssetGenerationTypes";
    import AssetGenerationPanel from "../../AssetGeneration/AssetGenerationPanel.svelte";
    import Button from "../../UI/Button.svelte";
    import EntityEditorTabs from "../EntityEditor/EntityEditorTabs.svelte";
    import {
        clampTerrainSurfaceCrop,
        TERRAIN_SURFACE_EXTERNAL_PREVIEW_CELLS,
        TERRAIN_SURFACE_GRID_SIZE,
        TERRAIN_SURFACE_VARIATION_CELLS,
        terrainSurfaceCellSourceRect,
        terrainSurfaceTilePixelSize,
        type TerrainSurfaceCell,
        type TerrainSurfaceCrop,
    } from "./TerrainSurfaceAssetLayout";
    import {
        createTerrainSurfaceGuideReference,
        cropTerrainSurfaceSource,
        prepareTerrainSurfaceSource,
        TERRAIN_SURFACE_GENERATION_RULES,
    } from "./TerrainSurfaceAssetRaster";
    import type { ApprovedTerrainSurfaceAsset } from "./TerrainSurfaceAssetTypes";

    interface Props {
        disabled?: boolean;
        onApprove: (asset: ApprovedTerrainSurfaceAsset) => void | Promise<void>;
    }

    let { disabled = false, onApprove }: Props = $props();

    let sourceBlob: Blob | undefined = $state();
    let sourceUrl = $state("");
    let sourceImage: HTMLImageElement | undefined = $state();
    let sourceWidth = $state(0);
    let sourceHeight = $state(0);
    let crop = $state<TerrainSurfaceCrop>({ x: 0, y: 0, size: TERRAIN_SURFACE_GRID_SIZE });
    let automaticCrop = $state<TerrainSurfaceCrop>({ x: 0, y: 0, size: TERRAIN_SURFACE_GRID_SIZE });
    let provenance: Omit<ApprovedTerrainSurfaceAsset, "blob" | "crop" | "gridColumns" | "gridRows" | "tilePixelSize"> =
        $state({ source: "imported" });
    let presetReferences: readonly AssetGenerationReference[] = $state([]);
    let activeTab = $state("external");
    let error = $state("");
    let busy = $state(false);
    let dropActive = $state(false);
    let alignmentCanvas: HTMLCanvasElement | undefined = $state();
    let reviewCanvas: HTMLCanvasElement | undefined = $state();
    let dragging = $state(false);
    let dragStartX = 0;
    let dragStartY = 0;
    let cropStartX = 0;
    let cropStartY = 0;

    onMount(() => {
        createTerrainSurfaceGuideReference()
            .then((reference) => (presetReferences = [reference]))
            .catch(
                (reason) =>
                    (error = reason instanceof Error ? reason.message : "The surface guide could not be prepared."),
            );
    });

    onDestroy(() => {
        if (sourceUrl !== "") URL.revokeObjectURL(sourceUrl);
    });

    $effect(() => {
        const scheduledCrop = crop;
        const scheduledTab = activeTab;
        const scheduledImage = sourceImage;
        const scheduledAlignmentCanvas = alignmentCanvas;
        const scheduledReviewCanvas = reviewCanvas;
        queueMicrotask(() => {
            if (
                crop !== scheduledCrop ||
                activeTab !== scheduledTab ||
                sourceImage !== scheduledImage ||
                alignmentCanvas !== scheduledAlignmentCanvas ||
                reviewCanvas !== scheduledReviewCanvas
            ) {
                return;
            }
            drawCanvases();
        });
    });

    async function useSource(
        blob: Blob,
        nextProvenance: Omit<
            ApprovedTerrainSurfaceAsset,
            "blob" | "crop" | "gridColumns" | "gridRows" | "tilePixelSize"
        >,
    ) {
        busy = true;
        error = "";
        try {
            const prepared = await prepareTerrainSurfaceSource(blob);
            if (sourceUrl !== "") URL.revokeObjectURL(sourceUrl);
            sourceBlob = blob;
            sourceUrl = URL.createObjectURL(blob);
            sourceWidth = prepared.width;
            sourceHeight = prepared.height;
            crop = prepared.crop;
            automaticCrop = prepared.crop;
            provenance = nextProvenance;
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "The surface image could not be opened.";
        } finally {
            busy = false;
        }
    }

    async function importImage(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (file !== undefined) await useImportedFile(file);
    }

    async function dropImage(event: DragEvent) {
        event.preventDefault();
        dropActive = false;
        const file = event.dataTransfer?.files[0];
        if (file !== undefined) await useImportedFile(file);
    }

    async function useImportedFile(file: File) {
        if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
            error = "Choose a PNG, JPEG, or WebP image.";
            return;
        }
        await useSource(file, { source: "imported" });
    }

    function replaceSource() {
        sourceBlob = undefined;
        sourceImage = undefined;
        sourceWidth = 0;
        sourceHeight = 0;
        if (sourceUrl !== "") URL.revokeObjectURL(sourceUrl);
        sourceUrl = "";
        error = "";
    }

    function resetAlignment() {
        crop = { ...automaticCrop };
    }

    function updateCropSize(event: Event) {
        const size = Number((event.currentTarget as HTMLInputElement).value);
        const centerX = crop.x + crop.size / 2;
        const centerY = crop.y + crop.size / 2;
        crop = clampTerrainSurfaceCrop(
            { x: centerX - size / 2, y: centerY - size / 2, size },
            sourceWidth,
            sourceHeight,
        );
    }

    function startDrag(event: PointerEvent) {
        if (event.button !== 0 || sourceImage === undefined) return;
        dragging = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        cropStartX = crop.x;
        cropStartY = crop.y;
        alignmentCanvas?.setPointerCapture(event.pointerId);
    }

    function moveDrag(event: PointerEvent) {
        if (!dragging || alignmentCanvas === undefined) return;
        const view = sourceView(alignmentCanvas);
        const bounds = alignmentCanvas.getBoundingClientRect();
        const cssToCanvasX = alignmentCanvas.width / bounds.width;
        const cssToCanvasY = alignmentCanvas.height / bounds.height;
        crop = clampTerrainSurfaceCrop(
            {
                ...crop,
                x: cropStartX + ((event.clientX - dragStartX) * cssToCanvasX) / view.scale,
                y: cropStartY + ((event.clientY - dragStartY) * cssToCanvasY) / view.scale,
            },
            sourceWidth,
            sourceHeight,
        );
    }

    function stopDrag(event: PointerEvent) {
        if (!dragging) return;
        dragging = false;
        alignmentCanvas?.releasePointerCapture(event.pointerId);
    }

    async function approve() {
        if (sourceBlob === undefined) return;
        busy = true;
        error = "";
        try {
            const blob = await cropTerrainSurfaceSource(sourceBlob, crop);
            await onApprove({
                blob,
                crop: { ...crop },
                gridColumns: TERRAIN_SURFACE_GRID_SIZE,
                gridRows: TERRAIN_SURFACE_GRID_SIZE,
                tilePixelSize: terrainSurfaceTilePixelSize(crop),
                ...provenance,
            });
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "The surface asset could not be approved.";
        } finally {
            busy = false;
        }
    }

    function drawCanvases() {
        if (sourceImage === undefined || !sourceImage.complete || sourceImage.naturalWidth === 0) return;
        if (alignmentCanvas !== undefined) drawAlignmentCanvas(alignmentCanvas);
        if (reviewCanvas !== undefined) drawReviewCanvas(reviewCanvas);
    }

    function drawAlignmentCanvas(canvas: HTMLCanvasElement) {
        const context = canvas.getContext("2d");
        if (context === null || sourceImage === undefined) return;
        const view = sourceView(canvas);
        drawCheckerboard(context, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;
        context.drawImage(sourceImage, view.x, view.y, sourceWidth * view.scale, sourceHeight * view.scale);

        const x = view.x + crop.x * view.scale;
        const y = view.y + crop.y * view.scale;
        const size = crop.size * view.scale;
        context.fillStyle = "rgba(3, 8, 18, .62)";
        context.fillRect(0, 0, canvas.width, y);
        context.fillRect(0, y + size, canvas.width, canvas.height - y - size);
        context.fillRect(0, y, x, size);
        context.fillRect(x + size, y, canvas.width - x - size, size);
        context.strokeStyle = "#8bd5ff";
        context.lineWidth = 3;
        context.strokeRect(x, y, size, size);
        context.strokeStyle = "rgba(255,255,255,.72)";
        context.lineWidth = 1;
        for (let index = 1; index < TERRAIN_SURFACE_GRID_SIZE; index += 1) {
            const position = (size / TERRAIN_SURFACE_GRID_SIZE) * index;
            context.beginPath();
            context.moveTo(x + position, y);
            context.lineTo(x + position, y + size);
            context.moveTo(x, y + position);
            context.lineTo(x + size, y + position);
            context.stroke();
        }
    }

    function drawReviewCanvas(canvas: HTMLCanvasElement) {
        const context = canvas.getContext("2d");
        if (context === null || sourceImage === undefined) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawCheckerboard(context, canvas.width, canvas.height);
        if (activeTab === "variations") drawVariationPreview(context, canvas.width, canvas.height);
        else drawBoundaryPreview(context, canvas.width, canvas.height, activeTab === "internal");
    }

    function drawBoundaryPreview(context: CanvasRenderingContext2D, width: number, height: number, internal: boolean) {
        const size = Math.min(width, height) / 3;
        const originX = (width - size * 3) / 2;
        const originY = (height - size * 3) / 2;
        TERRAIN_SURFACE_EXTERNAL_PREVIEW_CELLS.forEach((cell, index) => {
            const column = index % 3;
            const row = Math.floor(index / 3);
            if (internal && column === 1 && row === 1) return;
            drawCell(context, cell, originX + column * size, originY + row * size, size, internal ? Math.PI : 0);
        });
        context.strokeStyle = "rgba(255,255,255,.25)";
        context.strokeRect(originX, originY, size * 3, size * 3);
    }

    function drawVariationPreview(context: CanvasRenderingContext2D, width: number, height: number) {
        const size = Math.min(width, height) / 3;
        const originX = (width - size * 3) / 2;
        const originY = (height - size * 3) / 2;
        const destinations = [
            { column: 1, row: 0 },
            { column: 0, row: 1 },
            { column: 1, row: 1 },
            { column: 2, row: 1 },
            { column: 1, row: 2 },
        ];
        TERRAIN_SURFACE_VARIATION_CELLS.forEach((cell, index) => {
            const destination = destinations[index];
            drawCell(context, cell, originX + destination.column * size, originY + destination.row * size, size, 0);
        });
    }

    function drawCell(
        context: CanvasRenderingContext2D,
        cell: TerrainSurfaceCell,
        destinationX: number,
        destinationY: number,
        destinationSize: number,
        rotation: number,
    ) {
        if (sourceImage === undefined) return;
        const source = terrainSurfaceCellSourceRect(crop, cell);
        context.save();
        context.translate(destinationX + destinationSize / 2, destinationY + destinationSize / 2);
        context.rotate(rotation);
        context.imageSmoothingEnabled = true;
        context.drawImage(
            sourceImage,
            source.x,
            source.y,
            source.size,
            source.size,
            -destinationSize / 2,
            -destinationSize / 2,
            destinationSize,
            destinationSize,
        );
        context.restore();
    }

    function sourceView(canvas: HTMLCanvasElement) {
        const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
        return {
            scale,
            x: (canvas.width - sourceWidth * scale) / 2,
            y: (canvas.height - sourceHeight * scale) / 2,
        };
    }

    function drawCheckerboard(context: CanvasRenderingContext2D, width: number, height: number) {
        context.fillStyle = "#111827";
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#1d2a3e";
        const square = 20;
        for (let y = 0; y < height; y += square) {
            for (let x = 0; x < width; x += square) {
                if ((x / square + y / square) % 2 === 0) context.fillRect(x, y, square, square);
            }
        }
    }
</script>

<section class="rounded-xl border border-white/15 bg-black/20 p-3" aria-label="Terrain surface asset editor">
    {#if error}<p class="mb-3 text-sm text-red-300" role="alert">{error}</p>{/if}

    {#if sourceBlob === undefined}
        <div class="mb-3">
            <label
                class="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-3 text-center transition-colors {dropActive
                    ? 'border-secondary bg-secondary/15'
                    : 'border-white/25 bg-black/20 hover:border-white/45 hover:bg-white/5'}"
                ondragenter={(event) => {
                    event.preventDefault();
                    dropActive = true;
                }}
                ondragover={(event) => event.preventDefault()}
                ondragleave={() => (dropActive = false)}
                ondrop={dropImage}
            >
                <strong class="text-xs">Drop a surface source image here</strong>
                <span class="text-[11px] text-white/50">or choose a PNG, JPEG, or WebP file</span>
                <input
                    class="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onchange={importImage}
                    {disabled}
                />
            </label>
        </div>

        {#if presetReferences.length > 0}
            <AssetGenerationPanel
                target="terrain-surface"
                title="Generate a terrain surface"
                promptPlaceholder="Describe the terrain material, edge character, texture, colour, and rendering style…"
                promptGuidance="AI generates one connected four-point specimen. The fixed geometry reference is supplied automatically; you control its material and visual style."
                generationRules={TERRAIN_SURFACE_GENERATION_RULES}
                {presetReferences}
                allowAnimation={false}
                acceptLabel="Align this surface"
                onAccept={({ blob, providerId, modelId, prompt }) =>
                    useSource(blob, { source: "generated", providerId, modelId, prompt })}
            />
        {:else}
            <p class="m-0 text-xs text-white/60">Preparing the fixed terrain geometry guide…</p>
        {/if}
    {:else}
        <img class="hidden" bind:this={sourceImage} src={sourceUrl} alt="" onload={drawCanvases} />

        <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
                <h3 class="m-0 text-sm font-semibold">Align the 5×5 surface grid</h3>
                <p class="mt-1 text-[11px] text-white/60">
                    Drag the logical grid over the source. Approval keeps the selected image data at its native
                    resolution; the editor does not impose a pixel-art or fixed-resolution format.
                </p>
            </div>
            <div class="flex gap-2">
                <Button appearance="border" size="sm" onclick={resetAlignment} disabled={busy}>Auto-align</Button>
                <Button appearance="border" size="sm" onclick={replaceSource} disabled={busy}>Replace</Button>
            </div>
        </header>

        <canvas
            bind:this={alignmentCanvas}
            width="520"
            height="520"
            aria-label="Surface source alignment canvas"
            class:cursor-grabbing={dragging}
            class="aspect-square w-full cursor-grab touch-none rounded-lg border border-white/15 bg-slate-950"
            onpointerdown={startDrag}
            onpointermove={moveDrag}
            onpointerup={stopDrag}
            onpointercancel={stopDrag}
        ></canvas>

        <label class="mt-3 block text-xs" for="terrain-surface-grid-size">
            Crop coverage
            <input
                id="terrain-surface-grid-size"
                class="mt-1 w-full"
                type="range"
                min={TERRAIN_SURFACE_GRID_SIZE}
                max={Math.max(TERRAIN_SURFACE_GRID_SIZE, Math.floor(Math.min(sourceWidth, sourceHeight) / 5) * 5)}
                step={TERRAIN_SURFACE_GRID_SIZE}
                value={crop.size}
                oninput={updateCropSize}
                disabled={busy}
            />
        </label>

        <EntityEditorTabs
            tabs={[
                { id: "external", label: "External boundary" },
                { id: "internal", label: "Internal boundary" },
                { id: "variations", label: "Surface variations" },
            ]}
            bind:activeTab
            spacingClass="mt-4"
        />

        <canvas
            bind:this={reviewCanvas}
            width="420"
            height="420"
            aria-label={`${activeTab} surface review`}
            class="mx-auto aspect-square w-full max-w-[420px] rounded-lg border border-white/15 bg-slate-950"
        ></canvas>
        <p class="mt-2 text-[11px] leading-4 text-white/60">
            {activeTab === "external"
                ? "Representative outer pieces are assembled without gaps; every source-grid variation remains in the approved asset."
                : activeTab === "internal"
                  ? "The same continuous boundary is turned inward around an empty centre for enclosure review."
                  : "The five uninterrupted centre cells are retained as reusable full-surface variations."}
        </p>

        <div class="mt-3 flex justify-end">
            <Button variant="success" onclick={approve} disabled={disabled || busy}>
                {busy ? "Preparing surface…" : "Approve surface asset"}
            </Button>
        </div>
    {/if}
</section>
