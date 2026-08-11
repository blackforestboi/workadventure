<script lang="ts">
    import type { EntityPrefab } from "@workadventure/map-editor";
    import { CustomEntityDirection } from "@workadventure/messages";
    import { onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { v4 as uuidv4 } from "uuid";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import type { EntityVariant } from "../../../Phaser/Game/MapEditor/Entities/EntityVariant";
    import type { CategoryTag, SelectableTag } from "../../../Stores/MapEditorStore";
    import {
        mapEditorDeleteCustomEntityEventStore,
        mapEditorEntityModeStore,
        mapEditorEntityUploadDraftStore,
        mapEditorModifyCustomEntityEventStore,
        mapEditorSelectedEntityPrefabStore,
        mapEditorSelectedEntityStore,
        selectCategoryStore,
    } from "../../../Stores/MapEditorStore";
    import Input from "../../Input/Input.svelte";
    import ButtonClose from "../../Input/ButtonClose.svelte";
    import Button from "../../UI/Button.svelte";
    import CustomEntityEditionForm from "./CustomEntityEditionForm/CustomEntityEditionForm.svelte";
    import EntitiesGrid from "./EntitiesGrid.svelte";
    import EntityVariantColorPicker from "./EntityItem/EntityVariantColorPicker.svelte";
    import EntityVariantPositionPicker from "./EntityItem/EntityVariantPositionPicker.svelte";
    import EntityUpload from "./EntityUpload/EntityUpload.svelte";
    import TagListItem from "./TagListItem.svelte";
    import { IconChevronLeft, IconCloudUpload } from "@wa-icons";

    const entitiesCollectionsManager = gameManager.getCurrentGameScene().getEntitiesCollectionsManager();
    const entitiesPrefabsVariants = entitiesCollectionsManager.getEntitiesPrefabsVariantStore();
    const MOST_USED_CATEGORY_LIMIT = 12;

    let pickedEntity: EntityPrefab | undefined = $state(undefined);
    let pickedEntityVariant: EntityVariant | undefined = $state(undefined);
    let selectedColor = $state("");

    let searchTerm = $state("");
    let showUpload = $state(false);
    let saveAsCustomPending = $state(false);
    let saveAsCustomError = $state<string>();
    let saveAsCustomCommandId: string | undefined;

    const mapEditorSelectedEntityPrefabStoreUnsubscriber = mapEditorSelectedEntityPrefabStore.subscribe(
        (prefab?: EntityPrefab) => {
            pickedEntity = prefab;
        },
    );

    const entitiesPrefabsVariantStoreUnsubscriber = entitiesCollectionsManager
        .getEntitiesPrefabsVariantStore()
        .subscribe((entitiesPrefabsVariants) => {
            if (pickedEntityVariant) {
                pickedEntityVariant = entitiesPrefabsVariants.find(
                    (entityPrefabVariant) => pickedEntityVariant?.id === entityPrefabVariant.id,
                );
                pickedEntity = pickedEntityVariant?.defaultPrefab;
            }
        });

    const entityUploadDraftStoreUnsubscriber = mapEditorEntityUploadDraftStore.subscribe((draft) => {
        if (!saveAsCustomCommandId || draft?.commandId !== saveAsCustomCommandId) {
            return;
        }
        if (draft.status === "failed") {
            saveAsCustomPending = false;
            saveAsCustomError = draft.error;
        } else if (draft.status === "acknowledged") {
            mapEditorEntityUploadDraftStore.clear(saveAsCustomCommandId);
            saveAsCustomCommandId = undefined;
            saveAsCustomPending = false;
            saveAsCustomError = undefined;
            clearEntitySelection();
            selectCategoryStore.set({ kind: "special", tag: "custom" });
        }
    });

    function removeEntity(id: string) {
        mapEditorDeleteCustomEntityEventStore.set({ id });
        clearEntitySelection();
    }

    function saveCustomEntityModifications(customEntity: EntityPrefab) {
        mapEditorModifyCustomEntityEventStore.set($state.snapshot(customEntity));
    }

    async function saveEntity(customEntity: EntityPrefab) {
        if (customEntity.type === "Custom") {
            saveCustomEntityModifications(customEntity);
            return;
        }

        saveAsCustomPending = true;
        saveAsCustomError = undefined;
        try {
            const response = await fetch(customEntity.imagePath);
            if (!response.ok) {
                throw new Error(`The asset image could not be loaded (${response.status}).`);
            }
            const source = await response.blob();
            const generatedId = uuidv4();
            const commandId = uuidv4();
            const extension =
                new URL(customEntity.imagePath, window.location.href).pathname.match(/\.[A-Za-z0-9]+$/)?.[0] ?? ".png";
            const safeName = customEntity.name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "asset";
            const sourceName = `${safeName}${extension}`;
            saveAsCustomCommandId = commandId;
            mapEditorEntityUploadDraftStore.accept({
                commandId,
                source,
                sourceName,
                previewUrl: customEntity.imagePath,
                uploadEntityMessage: {
                    id: generatedId,
                    file: new Uint8Array(await source.arrayBuffer()),
                    direction: CustomEntityDirection.Down,
                    name: customEntity.name,
                    tags: $state.snapshot(customEntity.tags),
                    imagePath: `${generatedId}-${sourceName}`,
                    collisionGrid: $state.snapshot(customEntity.collisionGrid),
                    depthOffset: customEntity.depthOffset,
                    color: customEntity.color,
                },
            });
        } catch (error) {
            saveAsCustomCommandId = undefined;
            saveAsCustomPending = false;
            saveAsCustomError = error instanceof Error ? error.message : "The asset could not be saved.";
        }
    }

    function onPickItem(entityPrefab: EntityPrefab) {
        mapEditorSelectedEntityPrefabStore.set($state.snapshot(entityPrefab));
    }

    function onPickEntityVariant(entityVariant: EntityVariant) {
        showUpload = false;
        saveAsCustomError = undefined;
        pickedEntity = entityVariant.defaultPrefab;
        pickedEntityVariant = entityVariant;
        onColorChange(pickedEntity.color);
    }

    function onColorChange(color: string) {
        selectedColor = color;
        pickedEntity = pickedEntityVariant?.getEntityPrefabsPositions(color)[0];
        mapEditorSelectedEntityPrefabStore.set(pickedEntity ? $state.snapshot(pickedEntity) : undefined);
    }

    function onSelectedTag(tag: CategoryTag) {
        selectCategoryStore.set(tag);
    }

    function displayTagListAndClearCurrentSelection() {
        get(mapEditorSelectedEntityStore)?.delete();
        mapEditorEntityModeStore.set("ADD");
        clearEntitySelection();
        selectCategoryStore.set(undefined);
        searchTerm = "";
    }

    function clearEntitySelection() {
        pickedEntityVariant = undefined;
        pickedEntity = undefined;
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorSelectedEntityPrefabStore.set(undefined);
    }

    function getForEntitiesPrefabsVariantsWithCategories(
        entitiesPrefabsVariants: EntityVariant[],
    ): { category: CategoryTag; entitiesPrefabsVariants: EntityVariant[] }[] {
        const entitiesPrefabsVariantsGroupedByTag = entitiesPrefabsVariants.reduce(
            (groupByTag: { [tag: string]: EntityVariant[] }, entityPrefabVariant) => {
                const { tags } = entityPrefabVariant.defaultPrefab;
                tags.forEach((tag) => {
                    groupByTag[tag] = groupByTag[tag] ?? [];
                    groupByTag[tag].push(entityPrefabVariant);
                });
                return groupByTag;
            },
            {},
        );
        const customEntitiesPrefabsVariants = {
            Custom: entitiesPrefabsVariants.filter(
                (entityPrefabVariant) => entityPrefabVariant.defaultPrefab.type === "Custom",
            ),
        };
        const mostUsedEntitiesPrefabsVariants = getMostUsedEntitiesPrefabsVariants(entitiesPrefabsVariants);

        const groupedCategories: { category: CategoryTag; entitiesPrefabsVariants: EntityVariant[] }[] = [];

        if (mostUsedEntitiesPrefabsVariants.length > 0) {
            groupedCategories.push({
                category: { kind: "special", tag: "most_used" },
                entitiesPrefabsVariants: mostUsedEntitiesPrefabsVariants,
            });
        }

        groupedCategories.push({
            category: { kind: "special", tag: "custom" },
            entitiesPrefabsVariants: customEntitiesPrefabsVariants.Custom,
        });

        groupedCategories.push(
            ...Object.entries(entitiesPrefabsVariantsGroupedByTag)
                .sort()
                .map(([tag, groupedPrefabsVariants]) => ({
                    category: { kind: "tag", tag } as const,
                    entitiesPrefabsVariants: groupedPrefabsVariants,
                })),
        );

        return groupedCategories;
    }

    function getMostUsedEntitiesPrefabsVariants(entitiesPrefabsVariants: EntityVariant[]): EntityVariant[] {
        const entities = gameManager
            .getCurrentGameScene()
            .getGameMap()
            .getWamFile()
            ?.getGameMapEntities()
            .getEntities();

        if (!entities) {
            return [];
        }

        const usageCountByPrefabId = Object.values(entities).reduce((usageCount, entity) => {
            usageCount.set(entity.prefabRef.id, (usageCount.get(entity.prefabRef.id) ?? 0) + 1);
            return usageCount;
        }, new Map<string, number>());

        return entitiesPrefabsVariants
            .map((entityPrefabVariant) => ({
                entityPrefabVariant,
                count: entityPrefabVariant.prefabIds.reduce(
                    (count, prefabId) => count + (usageCountByPrefabId.get(prefabId) ?? 0),
                    0,
                ),
            }))
            .filter(({ count }) => count > 0)
            .sort((a, b) => {
                if (a.count !== b.count) {
                    return b.count - a.count;
                }
                return a.entityPrefabVariant.defaultPrefab.name.localeCompare(b.entityPrefabVariant.defaultPrefab.name);
            })
            .slice(0, MOST_USED_CATEGORY_LIMIT)
            .map(({ entityPrefabVariant }) => entityPrefabVariant);
    }

    function getCategoryLabel(category: CategoryTag): string {
        if (category.kind === "special") {
            switch (category.tag) {
                case "custom":
                    return get(LL).mapEditor.entityEditor.specialTags.customLabel();
                case "most_used":
                    return get(LL).mapEditor.entityEditor.specialTags.mostUsedLabel();
            }
        }
        return category.tag;
    }

    function getEntitiesPrefabsVariantsFilteredByTag(
        entitiesPrefabsVariants: EntityVariant[],
        tag: SelectableTag,
        searchTerm: string,
    ) {
        if (tag === undefined) {
            return entitiesPrefabsVariants.filter(
                (entityPrefabVariant) =>
                    entityPrefabVariant.defaultPrefab.tags
                        .join(",")
                        .toLocaleLowerCase()
                        .indexOf(searchTerm.toLocaleLowerCase()) != -1 ||
                    entityPrefabVariant.defaultPrefab.name.toLowerCase().includes(searchTerm.toLowerCase()),
            );
        }
        if (tag.kind === "special" && tag.tag === "custom") {
            return entitiesPrefabsVariants.filter(
                (entityPrefabVariant) =>
                    entityPrefabVariant.defaultPrefab.type === "Custom" &&
                    entityPrefabVariant.defaultPrefab.name.toLowerCase().includes(searchTerm.toLowerCase()),
            );
        }
        if (tag.kind === "special" && tag.tag === "most_used") {
            return getMostUsedEntitiesPrefabsVariants(entitiesPrefabsVariants).filter((entityPrefabVariant) =>
                entityPrefabVariant.defaultPrefab.name.toLowerCase().includes(searchTerm.toLowerCase()),
            );
        }
        return entitiesPrefabsVariants.filter(
            (entityPrefabVariant) =>
                entityPrefabVariant.defaultPrefab.tags.includes(tag.tag) &&
                entityPrefabVariant.defaultPrefab.name.toLowerCase().includes(searchTerm.toLowerCase()),
        );
    }

    let entitiesPrefabsVariantsWithCategories = $derived(
        getForEntitiesPrefabsVariantsWithCategories($entitiesPrefabsVariants),
    );
    let filteredEntityPrefabVariants = $derived(
        getEntitiesPrefabsVariantsFilteredByTag($entitiesPrefabsVariants, $selectCategoryStore, searchTerm),
    );

    onDestroy(() => {
        mapEditorSelectedEntityPrefabStoreUnsubscriber();
        entitiesPrefabsVariantStoreUnsubscriber();
        entityUploadDraftStoreUnsubscriber();
    });
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
    <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
            {#if showUpload}
                <div class="flex min-w-0 items-center gap-2">
                    <button
                        class="flex shrink-0 items-center rounded-full p-2 hover:bg-white/10"
                        aria-label={$LL.mapEditor.entityEditor.buttons.back()}
                        data-testid="backToAssets"
                        onclick={() => (showUpload = false)}
                    >
                        <IconChevronLeft />
                    </button>
                    <p class="m-0 truncate text-lg">{$LL.mapEditor.entityEditor.header.title()}</p>
                </div>
            {:else if $selectCategoryStore === undefined}
                <p class="m-0 text-[22px]">{$LL.mapEditor.entityEditor.header.title()}</p>
            {:else}
                <div class="flex flex-row items-center gap-4">
                    <button
                        class="p-2 rounded-full flex flex-row items-center hover:bg-white/10"
                        data-testid="clearCurrentSelection"
                        onclick={displayTagListAndClearCurrentSelection}
                    >
                        <IconChevronLeft />{$LL.mapEditor.entityEditor.buttons.back()}
                    </button>
                </div>
            {/if}
            {#if !showUpload}
                <Button
                    size="sm"
                    variant="light"
                    appearance="border"
                    onclick={() => {
                        clearEntitySelection();
                        showUpload = true;
                    }}
                >
                    {#snippet icon()}<IconCloudUpload font-size={16} />{/snippet}
                    Create new
                </Button>
            {/if}
        </div>
        {#if !showUpload}
            <div class="flex *:w-full">
                <Input
                    rounded
                    bind:value={searchTerm}
                    placeholder={$LL.mapEditor.entityEditor.itemPicker.searchPlaceholder()}
                />
            </div>
        {/if}
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
        {#if showUpload}
            <div class="px-3 pb-3">
                <EntityUpload />
            </div>
        {:else if $selectCategoryStore === undefined && searchTerm === ""}
            <ul class="list-none !p-0 min-w-full">
                {#each entitiesPrefabsVariantsWithCategories as { category, entitiesPrefabsVariants } (`${category.kind}-${category.tag}`)}
                    <TagListItem
                        selectedTag={(category) => {
                            onSelectedTag(category);
                        }}
                        tag={category}
                        label={getCategoryLabel(category)}
                        {entitiesPrefabsVariants}
                    />
                {/each}
            </ul>
        {:else}
            <div class="flex min-h-full flex-col gap-3">
                <section class="shrink-0 rounded-xl border border-white/10 bg-black/10 p-3">
                    <div class="mb-2 flex items-center justify-between gap-3">
                        <span class="font-bold text-lg">
                            {$selectCategoryStore ? getCategoryLabel($selectCategoryStore) : "Assets"}
                        </span>
                        <span class="text-xs opacity-60">{filteredEntityPrefabVariants.length} options</span>
                    </div>
                    <div class="max-h-[220px] overflow-auto">
                        <EntitiesGrid
                            entityPrefabVariants={filteredEntityPrefabVariants}
                            onSelectEntity={onPickEntityVariant}
                            currentSelectedEntityId={pickedEntity?.id}
                        />
                    </div>
                </section>

                {#if pickedEntityVariant && pickedEntity}
                    <section class="shrink-0 rounded-xl border border-white/10 bg-white/5 p-3">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="m-0 truncate font-bold">{pickedEntityVariant.defaultPrefab.name}</p>
                                <p class="m-0 text-xs opacity-60">Choose a color and view before editing the asset.</p>
                            </div>
                            <ButtonClose
                                onclick={clearEntitySelection}
                                dataTestId="clearEntitySelection"
                                size="sm"
                                bgColor="bg-white/10"
                                hoverColor="bg-white/20"
                            />
                        </div>
                        <div class="mt-2 flex flex-wrap items-end gap-4">
                            <EntityVariantColorPicker
                                colors={pickedEntityVariant.colors}
                                {selectedColor}
                                {onColorChange}
                            />
                            <EntityVariantPositionPicker
                                entityPrefabsPositions={pickedEntityVariant.getEntityPrefabsPositions(selectedColor)}
                                selectedEntity={pickedEntity}
                                {onPickItem}
                            />
                        </div>
                    </section>

                    {#if saveAsCustomError}
                        <div class="rounded-lg border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-100">
                            {saveAsCustomError}
                        </div>
                    {/if}

                    <div class="min-h-[520px] flex-1">
                        {#key pickedEntity.id}
                            <CustomEntityEditionForm
                                customEntity={pickedEntity}
                                isUploadForm={pickedEntity.type !== "Custom"}
                                disabled={saveAsCustomPending}
                                saveLabel={pickedEntity.type === "Custom" ? "Save asset" : "Save as custom"}
                                description={pickedEntity.type === "Custom"
                                    ? "Edit the asset and paint the areas players cannot cross."
                                    : "Edit this built-in asset. Saving creates a custom copy for this room."}
                                closeForm={clearEntitySelection}
                                removeEntity={({ entityId }) => {
                                    removeEntity(entityId);
                                }}
                                applyEntityModifications={saveEntity}
                            />
                        {/key}
                    </div>
                {:else}
                    <div
                        class="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-white/15 p-6 text-center text-sm opacity-60"
                    >
                        Select an asset above to preview it, edit its options, and add collision areas.
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
