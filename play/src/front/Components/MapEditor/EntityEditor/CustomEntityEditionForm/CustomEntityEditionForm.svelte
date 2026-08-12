<script lang="ts">
    import type { EntityPrefab } from "@workadventure/map-editor";
    import { onDestroy } from "svelte";
    import LL from "../../../../../i18n/i18n-svelte";
    import EntityImage from "../EntityItem/EntityImage.svelte";
    import type { InputTagOption } from "../../../Input/InputTagOption";
    import InputTags from "../../../Input/InputTags.svelte";
    import Select from "../../../Input/Select.svelte";
    import Input from "../../../Input/Input.svelte";
    import Button from "../../../UI/Button.svelte";
    import EntityEditionCollisionGrid from "./EntityEditionCollisionGrid.svelte";
    import { initializeCollisionGrid, resizeCollisionGrid } from "./CollisionGridResizer";
    import { getDefaultHeightInTiles, getOpaqueImageBounds } from "./OpaqueImageBounds";
    import { ENTITY_SIZE_TILE_OPTIONS, MAP_TILE_SIZE } from "../../../../Utils/EntityPrefabSize";
    import EntityEditorTabs from "../EntityEditorTabs.svelte";

    interface Props {
        customEntity: EntityPrefab;
        isUploadForm?: boolean;
        disabled?: boolean;
        saveLabel?: string;
        description?: string;
        showHeader?: boolean;
        onSaveReady?: (save: (() => Promise<void>) | undefined) => void;
        onSaveStatusChange?: (status: "idle" | "saving" | "saved") => void;
        closeForm?: () => void;
        removeEntity?: (payload: { entityId: string }) => void;
        applyEntityModifications?: (entity: EntityPrefab) => void | Promise<void>;
    }

    let {
        customEntity,
        isUploadForm = false,
        disabled = false,
        saveLabel,
        description,
        showHeader = true,
        onSaveReady,
        onSaveStatusChange,
        closeForm = () => {},
        removeEntity = () => {},
        applyEntityModifications = () => {},
    }: Props = $props();

    let {
        name,
        tags,
        collisionGrid: customEntityCollisionGrid,
        depthOffset: depthOffsetCustomEntity,
        defaultSizeInTiles: defaultSizeInTilesCustomEntity,
        defaultHeightInTiles: defaultHeightInTilesCustomEntity,
        previewPadding: initialPreviewPadding,
        previewOffsetX: initialPreviewOffsetX,
        previewOffsetY: initialPreviewOffsetY,
    } = $state((() => customEntity)());
    let inputTagOptions: InputTagOption[] | undefined = $state(tags.map((tag) => ({ value: tag, label: tag })));
    let collisionGrid = $state(customEntityCollisionGrid ? customEntityCollisionGrid.map((row) => [...row]) : []);
    let depthOffset: number = $state(depthOffsetCustomEntity ? depthOffsetCustomEntity * -1 : 0);
    let entityImageRef: HTMLImageElement | undefined = $state();
    let collisionGridWidth = $state(0);
    let collisionGridHeight = $state(0);
    let displayDepthCustomSelector = $state(false);
    let activeEditorTab = $state("positioning");
    let saveStatus = $state<"idle" | "saving" | "saved">("idle");
    let saveFeedbackTimeout: ReturnType<typeof setTimeout> | undefined;
    let previewPadding = $state(initialPreviewPadding ?? 24);
    let previewOffsetX = $state(initialPreviewOffsetX ?? 0);
    let previewOffsetY = $state(initialPreviewOffsetY ?? 0);
    let previewCanvas: HTMLDivElement | undefined = $state();
    let isPreviewDragging = $state(false);
    let previewDragStartX = 0;
    let previewDragStartY = 0;
    let previewOffsetStartX = 0;
    let previewOffsetStartY = 0;
    let defaultSizeInTiles = $state(defaultSizeInTilesCustomEntity ?? 1);
    let defaultHeightInTiles = $state(defaultHeightInTilesCustomEntity ?? 1);
    let collisionGridWidthIndex = $state(
        Math.max(
            0,
            ENTITY_SIZE_TILE_OPTIONS.findIndex((size) => size === defaultSizeInTiles),
        ),
    );
    let collisionGridHeightIndex = $state(
        Math.max(
            0,
            ENTITY_SIZE_TILE_OPTIONS.findIndex((size) => size === defaultHeightInTiles),
        ),
    );
    let imageResizeObserver: ResizeObserver | undefined;
    const hasCollisionAreas = $derived(collisionGrid.some((row) => row.some((cell) => cell === 1)));
    const positivePreviewPadding = $derived(Math.max(0, previewPadding));
    const previewCropInset = $derived(Math.max(0, -previewPadding));
    const previewScaleX = $derived(entityImageRef?.naturalWidth ? collisionGridWidth / entityImageRef.naturalWidth : 1);
    const previewScaleY = $derived(
        entityImageRef?.naturalHeight ? collisionGridHeight / entityImageRef.naturalHeight : 1,
    );
    const collisionFrameWidth = $derived(defaultSizeInTiles * MAP_TILE_SIZE * previewScaleX);
    const collisionFrameHeight = $derived(defaultHeightInTiles * MAP_TILE_SIZE * previewScaleY);

    const depthOptions = {
        GROUND_LEVEL: "GroundLevel",
        STANDING: "Standing",
        CUSTOM: "Custom",
    } as const;
    type DepthOption = (typeof depthOptions)[keyof typeof depthOptions];

    let selectedDepthOption: DepthOption = $state(
        (() => (depthOffset === 0 ? depthOptions.STANDING : depthOptions.CUSTOM))(),
    );

    function getModifiedCustomEntity(): EntityPrefab {
        return {
            ...customEntity,
            name,
            tags: inputTagOptions?.map((tagOption) => tagOption.value) ?? [],
            collisionGrid: hasCollisionAreas ? collisionGrid : undefined,
            depthOffset: depthOffset !== 0 ? -depthOffset : 0,
            defaultSizeInTiles,
            defaultHeightInTiles,
            previewPadding,
            previewOffsetX,
            previewOffsetY,
        };
    }

    async function save(): Promise<void> {
        if (saveStatus === "saving") return;
        saveFeedbackTimeout && clearTimeout(saveFeedbackTimeout);
        saveStatus = "saving";
        try {
            await applyEntityModifications(getModifiedCustomEntity());
            saveStatus = "saved";
            saveFeedbackTimeout = setTimeout(() => (saveStatus = "idle"), 1600);
        } catch (error) {
            saveStatus = "idle";
            console.error("The asset could not be saved.", error);
        }
    }

    function generateCollisionGridIfNotExists(imageRef: HTMLImageElement) {
        entityImageRef = imageRef;
        imageResizeObserver?.disconnect();
        imageResizeObserver = new ResizeObserver(([entry]) => {
            collisionGridWidth = entry?.contentRect.width ?? imageRef.width;
            collisionGridHeight = entry?.contentRect.height ?? imageRef.height;
        });
        imageResizeObserver.observe(imageRef);
        collisionGridWidth = imageRef.width;
        collisionGridHeight = imageRef.height;
        detectTileFootprint(imageRef);
        initializeCollisionGridForFrame();
    }

    function detectTileFootprint(imageRef: HTMLImageElement) {
        if (
            defaultHeightInTilesCustomEntity !== undefined ||
            imageRef.naturalWidth === 0 ||
            imageRef.naturalHeight === 0
        )
            return;
        try {
            const canvas = document.createElement("canvas");
            canvas.width = imageRef.naturalWidth;
            canvas.height = imageRef.naturalHeight;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) return;
            context.drawImage(imageRef, 0, 0);
            const bounds = getOpaqueImageBounds(
                context.getImageData(0, 0, canvas.width, canvas.height).data,
                canvas.width,
                canvas.height,
            );
            if (!bounds) return;
            defaultHeightInTiles = getDefaultHeightInTiles(bounds.width, bounds.height);
            collisionGridHeightIndex = ENTITY_SIZE_TILE_OPTIONS.findIndex((size) => size === defaultHeightInTiles);
        } catch {
            // A cross-origin image may not expose pixels. Keep the safe 1×1 fallback.
        }
    }

    function updateCollisionGrid(rowIndex: number, columnIndex: number) {
        collisionGrid[rowIndex][columnIndex] = collisionGrid[rowIndex][columnIndex] === 0 ? 1 : 0;
    }

    function clearCollisionAreas() {
        collisionGrid = collisionGrid.map((row) => row.map(() => 0));
    }

    function updateCollisionGridWidth(event: Event) {
        collisionGridWidthIndex = Number((event.currentTarget as HTMLInputElement).value);
        defaultSizeInTiles = ENTITY_SIZE_TILE_OPTIONS[collisionGridWidthIndex] ?? 1;
        resizeCollisionGridForFrame();
    }

    function updateCollisionGridHeight(event: Event) {
        collisionGridHeightIndex = Number((event.currentTarget as HTMLInputElement).value);
        defaultHeightInTiles = ENTITY_SIZE_TILE_OPTIONS[collisionGridHeightIndex] ?? 1;
        resizeCollisionGridForFrame();
    }

    function updatePreviewPadding(event: Event) {
        previewPadding = Number((event.currentTarget as HTMLInputElement).value);
    }

    function startPreviewDrag(event: PointerEvent) {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest("[data-collision-grid]")))
            return;
        isPreviewDragging = true;
        previewDragStartX = event.clientX;
        previewDragStartY = event.clientY;
        previewOffsetStartX = previewOffsetX;
        previewOffsetStartY = previewOffsetY;
        previewCanvas?.setPointerCapture(event.pointerId);
    }

    function movePreview(event: PointerEvent) {
        if (!isPreviewDragging) return;
        previewOffsetX = Math.max(
            -512,
            Math.min(512, Math.round(previewOffsetStartX + (event.clientX - previewDragStartX) / previewScaleX)),
        );
        previewOffsetY = Math.max(
            -512,
            Math.min(512, Math.round(previewOffsetStartY + (event.clientY - previewDragStartY) / previewScaleY)),
        );
    }

    function stopPreviewDrag(event: PointerEvent) {
        if (!isPreviewDragging) return;
        isPreviewDragging = false;
        previewCanvas?.releasePointerCapture(event.pointerId);
    }

    function resizeCollisionGridForFrame() {
        if (collisionGridWidth <= 0 || collisionGridHeight <= 0) return;
        const columns = Math.max(1, Math.ceil(defaultSizeInTiles));
        const rows = Math.max(1, Math.ceil(defaultHeightInTiles));
        collisionGrid = resizeCollisionGrid(collisionGrid, rows, columns);
    }

    function initializeCollisionGridForFrame() {
        if (collisionGridWidth <= 0 || collisionGridHeight <= 0) return;
        const columns = Math.max(1, Math.ceil(defaultSizeInTiles));
        const rows = Math.max(1, Math.ceil(defaultHeightInTiles));
        collisionGrid = initializeCollisionGrid(collisionGrid, rows, columns);
    }

    function updateDepthOffset(depthOption: DepthOption) {
        displayDepthCustomSelector = depthOption === depthOptions.CUSTOM;
        if (depthOption === depthOptions.STANDING) {
            depthOffset = 0;
        } else if (depthOption === depthOptions.GROUND_LEVEL) {
            depthOffset = entityImageRef?.naturalHeight ?? 0;
        }
    }

    function getTranslationForDepthOption(depthOption: DepthOption) {
        if (depthOption === depthOptions.STANDING) {
            return $LL.mapEditor.entityEditor.customEntityEditorForm.standing();
        }
        if (depthOption === depthOptions.CUSTOM) {
            return $LL.mapEditor.entityEditor.customEntityEditorForm.custom();
        }
        return $LL.mapEditor.entityEditor.customEntityEditorForm.groundLevel();
    }

    $effect(() => {
        updateDepthOffset(selectedDepthOption);
    });

    $effect(() => {
        onSaveReady?.(save);
        return () => onSaveReady?.(undefined);
    });

    $effect(() => onSaveStatusChange?.(saveStatus));

    onDestroy(() => {
        imageResizeObserver?.disconnect();
        saveFeedbackTimeout && clearTimeout(saveFeedbackTimeout);
    });
</script>

<section
    class="flex min-h-0 flex-1 flex-col overflow-hidden"
    aria-describedby={description === undefined ? undefined : "image-editor-description"}
>
    {#if description !== undefined}
        <p id="image-editor-description" class="sr-only">{description}</p>
    {/if}
    {#if showHeader}
        <header class="flex items-center justify-between gap-3 px-1 pb-3">
            <h2 class="m-0 min-w-0 truncate text-lg font-semibold">{name}</h2>
            <Button
                size="sm"
                variant="secondary"
                appearance={saveStatus === "saving" ? "border" : "filled"}
                class={saveStatus === "saving" ? "border-blue-400 bg-transparent text-blue-300" : ""}
                disabled={disabled || saveStatus === "saving"}
                dataTestId="applyEntityModifications"
                onclick={save}
            >
                {saveStatus === "saving"
                    ? "Saving…"
                    : saveStatus === "saved"
                      ? "Saved"
                      : (saveLabel ?? $LL.mapEditor.entityEditor.buttons.save())}
            </Button>
        </header>
    {/if}

    <div class="min-h-0 flex-1 overflow-auto">
        <div
            bind:this={previewCanvas}
            role="application"
            aria-label="Asset positioning canvas"
            class:cursor-grabbing={isPreviewDragging}
            class="relative flex min-h-[420px] w-full cursor-grab touch-none items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(45deg,rgba(255,255,255,.05)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,.05)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,.05)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,.05)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
            style:padding={`${positivePreviewPadding}px`}
            onpointerdown={startPreviewDrag}
            onpointermove={movePreview}
            onpointerup={stopPreviewDrag}
            onpointercancel={stopPreviewDrag}
        >
            <div
                class="relative inline-flex max-h-[560px] max-w-full items-center justify-center"
                style:clip-path={previewCropInset > 0 ? `inset(${previewCropInset}px)` : undefined}
                style:transform={`translate(${previewOffsetX * previewScaleX}px, ${previewOffsetY * previewScaleY}px)`}
            >
                <EntityImage
                    classNames="max-h-[560px] max-w-full object-contain"
                    imageLoad={generateCollisionGridIfNotExists}
                    imageSource={customEntity.imagePath}
                    imageAlt={customEntity.name}
                />
            </div>
            {#if collisionGridWidth > 0 && collisionGridHeight > 0}
                <div
                    class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style:width={`${collisionGridWidth}px`}
                    style:height={`${collisionGridHeight}px`}
                >
                    <EntityEditionCollisionGrid
                        {collisionGrid}
                        {updateCollisionGrid}
                        collisionGridWidth={collisionFrameWidth}
                        collisionGridHeight={collisionFrameHeight}
                    />
                </div>
            {/if}
        </div>

        <EntityEditorTabs
            tabs={[
                { id: "positioning", label: "Positioning" },
                { id: "style", label: "Style" },
                { id: "metadata", label: "Metadata" },
            ]}
            bind:activeTab={activeEditorTab}
            spacingClass="mt-4"
        />

        <div class="py-4">
            {#if activeEditorTab === "metadata"}
                <section class="flex flex-col gap-4" aria-label="Metadata">
                    <div>
                        <label class="mb-2 block" for="name"
                            ><b>{$LL.mapEditor.entityEditor.customEntityEditorForm.imageName()}</b></label
                        >
                        <Input
                            class="min-w-full rounded-md border border-solid border-contrast-400 bg-contrast px-2 py-2.5 text-[16px] text-white"
                            bind:value={name}
                            id="name"
                            data-testid="name"
                        />
                    </div>
                    <div>
                        <label class="mb-2 block" for="tags"
                            ><b>{$LL.mapEditor.entityEditor.customEntityEditorForm.tags()}</b></label
                        >
                        <InputTags
                            bind:value={inputTagOptions}
                            placeholder={$LL.mapEditor.entityEditor.customEntityEditorForm.writeTag()}
                        />
                    </div>
                </section>
            {:else if activeEditorTab === "style"}
                <section class="flex flex-col gap-4" aria-label="Style">
                    <Select
                        id="type"
                        label={$LL.mapEditor.entityEditor.customEntityEditorForm.depth()}
                        bind:value={selectedDepthOption}
                    >
                        {#each Object.values(depthOptions) as depthOption (depthOption)}
                            <option value={depthOption}>{getTranslationForDepthOption(depthOption)}</option>
                        {/each}
                    </Select>
                    {#if displayDepthCustomSelector}
                        <div>
                            <label class="mb-2 block text-sm" for="depthOffset">Character overlap</label>
                            <input
                                id="depthOffset"
                                class="w-full cursor-grab active:cursor-grabbing"
                                bind:value={depthOffset}
                                type="range"
                                min="0"
                                max={entityImageRef?.naturalHeight ?? 0}
                            />
                            <div class="flex justify-between text-xs opacity-60">
                                <span>{$LL.mapEditor.entityEditor.customEntityEditorForm.wokaAbove()}</span>
                                <span>{$LL.mapEditor.entityEditor.customEntityEditorForm.wokaBelow()}</span>
                            </div>
                        </div>
                    {/if}
                </section>
            {:else}
                <section class="flex flex-col gap-4" aria-label="Positioning">
                    {#if hasCollisionAreas}
                        <div>
                            <Button
                                size="xs"
                                variant="light"
                                appearance="border"
                                {disabled}
                                onclick={clearCollisionAreas}>Clear collision areas</Button
                            >
                        </div>
                    {/if}
                    <div>
                        <div class="mb-2 flex items-center justify-between gap-3">
                            <label for="previewPadding">Padding</label>
                            <span class="text-xs opacity-60">{previewPadding}px</span>
                        </div>
                        <input
                            id="previewPadding"
                            class="w-full cursor-grab active:cursor-grabbing"
                            value={previewPadding}
                            type="range"
                            min="-64"
                            max="64"
                            step="4"
                            oninput={updatePreviewPadding}
                        />
                        <div class="mt-1 flex justify-between text-[11px] opacity-50">
                            <span>Crop</span>
                            <span>Add space</span>
                        </div>
                    </div>
                    <div>
                        <div class="mb-2 flex items-center justify-between gap-3">
                            <label for="collisionGridWidth">Grid width</label>
                            <span class="text-xs opacity-60">
                                {defaultSizeInTiles}
                                {defaultSizeInTiles === 1 ? "tile" : "tiles"} wide ·
                                {defaultSizeInTiles * MAP_TILE_SIZE}px
                            </span>
                        </div>
                        <input
                            id="collisionGridWidth"
                            class="w-full cursor-grab active:cursor-grabbing"
                            type="range"
                            min="0"
                            max={ENTITY_SIZE_TILE_OPTIONS.length - 1}
                            step="1"
                            value={collisionGridWidthIndex}
                            oninput={updateCollisionGridWidth}
                        />
                        <div class="mt-1 flex justify-between text-[11px] opacity-50">
                            <span>0.5 tile</span>
                            <span>100 tiles</span>
                        </div>
                    </div>
                    <div>
                        <div class="mb-2 flex items-center justify-between gap-3">
                            <label for="collisionGridHeight">Grid height</label>
                            <span class="text-xs opacity-60">
                                {defaultHeightInTiles}
                                {defaultHeightInTiles === 1 ? "tile" : "tiles"} tall ·
                                {defaultHeightInTiles * MAP_TILE_SIZE}px
                            </span>
                        </div>
                        <input
                            id="collisionGridHeight"
                            class="w-full cursor-grab active:cursor-grabbing"
                            type="range"
                            min="0"
                            max={ENTITY_SIZE_TILE_OPTIONS.length - 1}
                            step="1"
                            value={collisionGridHeightIndex}
                            oninput={updateCollisionGridHeight}
                        />
                        <div class="mt-1 flex justify-between text-[11px] opacity-50">
                            <span>0.5 tile</span>
                            <span>100 tiles</span>
                        </div>
                        <p class="mb-0 mt-2 text-xs opacity-60">
                            The grid matches the asset's placed width and height.
                        </p>
                    </div>
                    <div>
                        <p class="m-0 text-xs opacity-70">
                            Click grid cells on the image to mark areas players cannot cross.
                        </p>
                    </div>
                    {#if !isUploadForm}
                        <div class="mt-auto pt-2">
                            <Button
                                size="sm"
                                variant="danger"
                                appearance="border"
                                {disabled}
                                dataTestId="removeEntity"
                                onclick={() => removeEntity({ entityId: customEntity.id })}
                            >
                                {$LL.mapEditor.entityEditor.buttons.delete()}
                            </Button>
                        </div>
                    {/if}
                </section>
            {/if}
        </div>
    </div>
</section>
