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
    import { createEmptyCollisionGrid, resizeCollisionGrid } from "./CollisionGridResizer";
    import { IconChevronLeft } from "@wa-icons";

    interface Props {
        customEntity: EntityPrefab;
        isUploadForm?: boolean;
        disabled?: boolean;
        saveLabel?: string;
        description?: string;
        closeForm?: () => void;
        removeEntity?: (payload: { entityId: string }) => void;
        applyEntityModifications?: (entity: EntityPrefab) => void;
    }

    let {
        customEntity,
        isUploadForm = false,
        disabled = false,
        saveLabel,
        description,
        closeForm = () => {},
        removeEntity = () => {},
        applyEntityModifications = () => {},
    }: Props = $props();

    let {
        name,
        tags,
        collisionGrid: customEntityCollisionGrid,
        depthOffset: depthOffsetCustomEntity,
    } = $state((() => customEntity)());
    let inputTagOptions: InputTagOption[] | undefined = $state(tags.map((tag) => ({ value: tag, label: tag })));
    let collisionGrid = $state(customEntityCollisionGrid ? customEntityCollisionGrid.map((row) => [...row]) : []);
    let depthOffset: number = $state(depthOffsetCustomEntity ? depthOffsetCustomEntity * -1 : 0);
    let entityImageRef: HTMLImageElement | undefined = $state();
    let collisionGridWidth = $state(0);
    let collisionGridHeight = $state(0);
    let displayDepthCustomSelector = $state(false);
    let previewPadding = $state(24);
    let collisionCellSize = $state(32);
    let imageResizeObserver: ResizeObserver | undefined;
    const hasCollisionAreas = $derived(collisionGrid.some((row) => row.some((cell) => cell === 1)));

    const depthOptions = {
        GROUND_LEVEL: "GroundLevel",
        STANDING: "Standing",
        CUSTOM: "Custom",
    } as const;
    type DepthOption = (typeof depthOptions)[keyof typeof depthOptions];

    let selectedDepthOption: DepthOption = $state(
        (() => (depthOffset === 0 ? depthOptions.STANDING : depthOptions.CUSTOM))(),
    );

    const COLLISION_GRID_SIZE = 32;

    function getModifiedCustomEntity(): EntityPrefab {
        return {
            ...customEntity,
            name,
            tags: inputTagOptions?.map((tagOption) => tagOption.value) ?? [],
            collisionGrid: hasCollisionAreas ? collisionGrid : undefined,
            depthOffset: depthOffset !== 0 ? -depthOffset : 0,
        };
    }

    function generateCollisionGridIfNotExists(imageRef: HTMLImageElement) {
        entityImageRef = imageRef;
        if (collisionGrid.length === 0) {
            const columnCount = Math.ceil(imageRef.naturalWidth / COLLISION_GRID_SIZE);
            const rowCount = Math.ceil(imageRef.naturalHeight / COLLISION_GRID_SIZE);
            collisionGrid = createEmptyCollisionGrid(rowCount, columnCount);
        }

        imageResizeObserver?.disconnect();
        imageResizeObserver = new ResizeObserver(([entry]) => {
            collisionGridWidth = entry?.contentRect.width ?? imageRef.width;
            collisionGridHeight = entry?.contentRect.height ?? imageRef.height;
        });
        imageResizeObserver.observe(imageRef);
        collisionGridWidth = imageRef.width;
        collisionGridHeight = imageRef.height;
    }

    function updateCollisionGrid(rowIndex: number, columnIndex: number) {
        collisionGrid[rowIndex][columnIndex] = collisionGrid[rowIndex][columnIndex] === 0 ? 1 : 0;
    }

    function clearCollisionAreas() {
        collisionGrid = collisionGrid.map((row) => row.map(() => 0));
    }

    function updateCollisionCellSize(event: Event) {
        const imageRef = entityImageRef;
        if (imageRef === undefined) return;
        collisionCellSize = Number((event.currentTarget as HTMLSelectElement).value);
        collisionGrid = resizeCollisionGrid(
            collisionGrid,
            Math.ceil(imageRef.naturalHeight / collisionCellSize),
            Math.ceil(imageRef.naturalWidth / collisionCellSize),
        );
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

    onDestroy(() => imageResizeObserver?.disconnect());
</script>

<section
    class="flex min-h-0 flex-1 flex-col overflow-hidden"
    aria-describedby={description === undefined ? undefined : "image-editor-description"}
>
    {#if description !== undefined}
        <p id="image-editor-description" class="sr-only">{description}</p>
    {/if}
    <header class="flex items-center justify-between gap-3 px-1 pb-3">
        <button
            type="button"
            class="flex min-w-0 items-center gap-2 rounded-full p-2 text-left hover:bg-white/10"
            aria-label={$LL.mapEditor.entityEditor.buttons.back()}
            onclick={closeForm}
        >
            <IconChevronLeft />
            <span class="truncate text-lg font-semibold">Edit image</span>
        </button>
        <Button
            size="sm"
            variant="secondary"
            {disabled}
            dataTestId="applyEntityModifications"
            onclick={() => applyEntityModifications(getModifiedCustomEntity())}
        >
            {saveLabel ?? $LL.mapEditor.entityEditor.buttons.save()}
        </Button>
    </header>

    <div class="min-h-0 flex-1 overflow-auto">
        <div
            class="relative flex min-h-[420px] w-full items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(45deg,rgba(255,255,255,.05)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,.05)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,.05)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,.05)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
            style:padding={`${previewPadding}px`}
        >
            <div class="relative inline-flex max-h-[560px] max-w-full items-center justify-center">
                <EntityImage
                    classNames="max-h-[560px] max-w-full object-contain"
                    imageLoad={generateCollisionGridIfNotExists}
                    imageSource={customEntity.imagePath}
                    imageAlt={customEntity.name}
                />
                {#if collisionGridWidth > 0 && collisionGridHeight > 0}
                    <EntityEditionCollisionGrid
                        {collisionGrid}
                        {updateCollisionGrid}
                        {collisionGridWidth}
                        {collisionGridHeight}
                    />
                {/if}
            </div>
        </div>

        <div class="grid grid-cols-1 gap-6 py-4 md:grid-cols-2">
            <section class="flex flex-col gap-4" aria-labelledby="metadata-heading">
                <h3 id="metadata-heading" class="m-0 text-base font-semibold">Metadata</h3>
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

            <section class="flex flex-col gap-4" aria-labelledby="positioning-heading">
                <h3 id="positioning-heading" class="m-0 text-base font-semibold">Positioning</h3>
                <div>
                    <div class="mb-2 flex items-center justify-between gap-3">
                        <label for="previewPadding">Padding</label>
                        <span class="text-xs opacity-60">{previewPadding}px</span>
                    </div>
                    <input
                        id="previewPadding"
                        class="w-full cursor-grab active:cursor-grabbing"
                        bind:value={previewPadding}
                        type="range"
                        min="0"
                        max="64"
                        step="4"
                    />
                </div>
                <div>
                    <label class="mb-2 block" for="collisionCellSize">Grid size</label>
                    <select
                        id="collisionCellSize"
                        class="w-full rounded-md border border-solid border-contrast-400 bg-contrast px-3 py-2.5 text-white"
                        value={collisionCellSize}
                        onchange={updateCollisionCellSize}
                    >
                        <option value="16">Fine · 16 px</option>
                        <option value="32">Standard · 32 px</option>
                        <option value="64">Large · 64 px</option>
                    </select>
                    <p class="mb-0 mt-2 text-xs opacity-60">Larger cells make a simpler collision mask.</p>
                </div>
                <div>
                    <div class="flex items-start justify-between gap-3">
                        <p class="m-0 text-xs opacity-70">
                            Click grid cells on the image to mark areas players cannot cross.
                        </p>
                        <Button
                            size="xs"
                            variant="light"
                            appearance="border"
                            disabled={disabled || !hasCollisionAreas}
                            onclick={clearCollisionAreas}>Clear collision areas</Button
                        >
                    </div>
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
        </div>
    </div>
</section>
