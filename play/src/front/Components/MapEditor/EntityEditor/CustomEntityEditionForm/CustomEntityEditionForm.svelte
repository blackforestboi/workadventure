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
    let floatingObject = $state((() => customEntityCollisionGrid === undefined)());
    let depthOffset: number = $state(depthOffsetCustomEntity ? depthOffsetCustomEntity * -1 : 0);
    let entityImageRef: HTMLImageElement | undefined = $state();
    let collisionGridWidth = $state(0);
    let collisionGridHeight = $state(0);
    let displayDepthCustomSelector = $state(false);
    let imageResizeObserver: ResizeObserver | undefined;

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
            collisionGrid: floatingObject ? undefined : collisionGrid,
            depthOffset: depthOffset !== 0 ? -depthOffset : 0,
        };
    }

    function generateCollisionGridIfNotExists(imageRef: HTMLImageElement) {
        entityImageRef = imageRef;
        if (collisionGrid.length === 0) {
            const columnCount = Math.ceil(imageRef.naturalWidth / COLLISION_GRID_SIZE);
            const rowCount = Math.ceil(imageRef.naturalHeight / COLLISION_GRID_SIZE);
            collisionGrid = Array.from({ length: rowCount }, () => Array(columnCount).fill(0));
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

    function activateCollisionAreas() {
        floatingObject = false;
        if (entityImageRef) {
            generateCollisionGridIfNotExists(entityImageRef);
        }
    }

    function removeCollisionAreas() {
        floatingObject = true;
    }

    function clearCollisionAreas() {
        collisionGrid = collisionGrid.map((row) => row.map(() => 0));
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

<section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/15">
    <header class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-white/10 px-4 py-3">
        <div class="min-w-0">
            <h3 class="m-0 truncate text-lg font-bold">{name || "Untitled asset"}</h3>
            <p class="m-0 text-xs opacity-60">
                {description ?? "Edit the asset and paint the areas players cannot cross."}
            </p>
        </div>
        <div class="flex items-center justify-end gap-2">
            {#if floatingObject}
                <Button size="sm" variant="light" appearance="border" {disabled} onclick={activateCollisionAreas}>
                    Add collision areas
                </Button>
            {:else}
                <Button size="sm" variant="light" appearance="border" {disabled} onclick={removeCollisionAreas}>
                    Remove collision areas
                </Button>
            {/if}
            <Button
                size="sm"
                variant="secondary"
                {disabled}
                dataTestId="applyEntityModifications"
                onclick={() => applyEntityModifications(getModifiedCustomEntity())}
            >
                {saveLabel ?? $LL.mapEditor.entityEditor.buttons.save()}
            </Button>
        </div>
    </header>

    <div
        class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 md:grid-cols-[minmax(240px,1.15fr)_minmax(220px,0.85fr)]"
    >
        <div class="flex min-h-[300px] flex-col rounded-xl border border-white/10 bg-black/20 p-3">
            <div
                class="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(45deg,rgba(255,255,255,.05)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,.05)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,.05)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,.05)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
            >
                <div class="relative inline-flex max-h-[420px] max-w-full items-center justify-center">
                    <EntityImage
                        classNames="max-h-[420px] max-w-full object-contain"
                        imageLoad={generateCollisionGridIfNotExists}
                        imageSource={customEntity.imagePath}
                        imageAlt={customEntity.name}
                    />
                    {#if !floatingObject && collisionGridWidth > 0 && collisionGridHeight > 0}
                        <EntityEditionCollisionGrid
                            {collisionGrid}
                            {updateCollisionGrid}
                            {collisionGridWidth}
                            {collisionGridHeight}
                        />
                    {/if}
                </div>
            </div>
            <p class="mb-0 mt-3 text-xs opacity-70">
                {#if floatingObject}
                    This asset currently has no collision. Players can walk through it.
                {:else}
                    Click the squares that should block players. Unselected parts remain walk-behind scenery.
                {/if}
            </p>
        </div>

        <div class="flex flex-col gap-4">
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
                <div class="rounded-lg border border-white/10 p-3">
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
            {#if !floatingObject}
                <div class="rounded-lg border border-white/10 p-3">
                    <div class="flex items-center justify-between gap-2">
                        <div>
                            <p class="m-0 font-bold">Collision mask</p>
                            <p class="m-0 text-xs opacity-60">The mask scales together with the object.</p>
                        </div>
                        <Button size="xs" variant="light" appearance="ghost" {disabled} onclick={clearCollisionAreas}>
                            Clear
                        </Button>
                    </div>
                </div>
            {/if}

            <div class="mt-auto flex flex-wrap gap-2 pt-2">
                {#if !isUploadForm}
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
                {/if}
                <Button size="sm" variant="contrast" appearance="ghost" {disabled} onclick={closeForm}>
                    {$LL.mapEditor.entityEditor.buttons.cancel()}
                </Button>
            </div>
        </div>
    </div>
</section>
