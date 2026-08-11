<script lang="ts">
    import { CustomEntityDirection } from "@workadventure/messages";
    import { onDestroy, onMount } from "svelte";
    import { v4 as uuidv4 } from "uuid";
    import type { EntityPrefab } from "@workadventure/map-editor";
    import { Direction, ENTITY_UPLOAD_SUPPORTED_FORMATS_FRONT } from "@workadventure/map-editor";
    import AssetGenerationPanel from "../../../AssetGeneration/AssetGenerationPanel.svelte";
    import {
        teapotGeneratedAssetApi,
        type TeapotGeneratedAssetView,
    } from "../../../../Services/TeapotGeneratedAssetApi";
    import LL from "../../../../../i18n/i18n-svelte";
    import {
        mapEditorEntityUploadDraftStore,
        selectCategoryStore,
        type MapEditorEntityUploadDraft,
    } from "../../../../Stores/MapEditorStore";
    import CustomEntityEditionForm from "../CustomEntityEditionForm/CustomEntityEditionForm.svelte";
    import { IconCloudUpload } from "@wa-icons";

    interface Props {
        generatedAsset?: Blob | File;
        generatedAssetName?: string;
    }

    let { generatedAsset, generatedAssetName = "generated-entity.png" }: Props = $props();

    let files: FileList | undefined = $state(undefined);
    let dropZoneRef: HTMLDivElement | undefined = $state();
    let customEntityToUpload: EntityPrefab | undefined = $state(undefined);
    let errorOnFile: string | undefined = $state();
    let selectedAsset: { source: Blob; name: string; previewUrl: string } | undefined = $state(undefined);
    let uploadDraft: MapEditorEntityUploadDraft | undefined = $state(undefined);
    let consumedGeneratedAsset: Blob | File | undefined;
    let savedAssets: TeapotGeneratedAssetView[] = $state([]);
    let savedAssetsLoading = $state(false);
    let savedAssetsError = $state<string>();
    const savedAssetsController = new AbortController();

    const BASIC_TYPE = "Custom";

    onMount(() => {
        savedAssetsLoading = true;
        teapotGeneratedAssetApi
            .list("map-entity", savedAssetsController.signal)
            .then((items) => {
                savedAssets = items;
            })
            .catch((reason: unknown) => {
                if (reason instanceof DOMException && reason.name === "AbortError") return;
                console.error("Failed to load saved generated map objects", reason);
                savedAssetsError = reason instanceof Error ? reason.message : "Saved assets could not be loaded.";
            })
            .finally(() => {
                savedAssetsLoading = false;
            });
    });

    $effect(() => {
        const file = files?.item(0);
        if (file) {
            acceptAsset(file, file.name);
        }
    });

    $effect(() => {
        if (generatedAsset && generatedAsset !== consumedGeneratedAsset) {
            consumedGeneratedAsset = generatedAsset;
            acceptAsset(generatedAsset, generatedAsset instanceof File ? generatedAsset.name : generatedAssetName);
        }
    });

    const mapEditorEntityUploadDraftStoreUnsubscriber = mapEditorEntityUploadDraftStore.subscribe((draft) => {
        uploadDraft = draft;
        if (draft === undefined) {
            return;
        }

        selectedAsset ??= {
            source: draft.source,
            name: draft.sourceName,
            previewUrl: draft.previewUrl,
        };
        customEntityToUpload ??= mapDraftToEntityPrefab(draft);

        if (draft.status === "acknowledged") {
            completeAndResetUpload(draft);
        }
    });

    function isASupportedFormat(format: string): boolean {
        return format.trim().length > 0 && ENTITY_UPLOAD_SUPPORTED_FORMATS_FRONT.includes(format);
    }
    function completeAndResetUpload(draft: MapEditorEntityUploadDraft) {
        // At the end, open the category of the uploaded image.
        const selectedTag = draft.uploadEntityMessage.tags[0] ?? BASIC_TYPE;
        selectCategoryStore.set({ kind: "tag", tag: selectedTag });
        initFileUpload(draft.commandId);
    }

    async function processFileToUpload(customEditedEntity: EntityPrefab) {
        if (selectedAsset && uploadDraft?.status !== "submitting") {
            const fileBuffer = await selectedAsset.source.arrayBuffer();
            const fileAsUint8Array = new Uint8Array(fileBuffer);
            const failedDraft = uploadDraft?.status === "failed" ? uploadDraft : undefined;
            const generatedId = failedDraft?.uploadEntityMessage.id ?? uuidv4();
            const commandId = failedDraft?.commandId ?? uuidv4();

            mapEditorEntityUploadDraftStore.accept({
                commandId,
                source: selectedAsset.source,
                sourceName: selectedAsset.name,
                previewUrl: selectedAsset.previewUrl,
                uploadEntityMessage: {
                    id: generatedId,
                    file: fileAsUint8Array,
                    direction: CustomEntityDirection.Down,
                    name: customEditedEntity.name,
                    tags: $state.snapshot(customEditedEntity.tags),
                    imagePath: failedDraft?.uploadEntityMessage.imagePath ?? `${generatedId}-${selectedAsset.name}`,
                    collisionGrid: customEditedEntity.collisionGrid,
                    depthOffset: customEditedEntity.depthOffset,
                    color: "",
                },
            });
        }
    }

    function acceptAsset(source: Blob, name: string) {
        if (!isASupportedFormat(source.type)) {
            console.error("File format not supported");
            errorOnFile = $LL.mapEditor.entityEditor.uploadEntity.errorOnFileFormat();
            return;
        }

        if (selectedAsset && uploadDraft?.status !== "submitting") {
            URL.revokeObjectURL(selectedAsset.previewUrl);
        }
        if (uploadDraft && uploadDraft.status !== "submitting") {
            mapEditorEntityUploadDraftStore.clear(uploadDraft.commandId);
        }
        const previewUrl = URL.createObjectURL(source);
        selectedAsset = { source, name, previewUrl };
        customEntityToUpload = {
            collectionName: "custom entities",
            name,
            imagePath: previewUrl,
            id: uuidv4(),
            direction: Direction.Down,
            tags: [],
            color: "",
            type: BASIC_TYPE,
        };
        errorOnFile = undefined;
    }

    async function reuseSavedAsset(asset: TeapotGeneratedAssetView): Promise<void> {
        savedAssetsError = undefined;
        savedAssetsLoading = true;
        try {
            const blob = await teapotGeneratedAssetApi.download(asset, savedAssetsController.signal);
            acceptAsset(blob, `${asset.id}-${asset.name.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 48)}.png`);
        } catch (reason: unknown) {
            if (reason instanceof DOMException && reason.name === "AbortError") return;
            savedAssetsError = reason instanceof Error ? reason.message : "Saved asset could not be opened.";
        } finally {
            savedAssetsLoading = false;
        }
    }

    function mapDraftToEntityPrefab(draft: MapEditorEntityUploadDraft): EntityPrefab {
        return {
            ...draft.uploadEntityMessage,
            collectionName: "custom entities",
            imagePath: draft.previewUrl,
            direction: Direction.Down,
            type: BASIC_TYPE,
        };
    }

    function initFileUpload(commandId?: string) {
        if (uploadDraft?.status === "submitting") {
            return;
        }
        if (selectedAsset) {
            URL.revokeObjectURL(selectedAsset.previewUrl);
        }
        files = undefined;
        selectedAsset = undefined;
        customEntityToUpload = undefined;
        mapEditorEntityUploadDraftStore.clear(commandId);
        errorOnFile = undefined;
    }

    function dropHandler(event: DragEvent) {
        const { files: filesFromDropEvent } = event.dataTransfer ?? {};
        if (filesFromDropEvent) {
            if (filesFromDropEvent.length > 1) {
                console.error("Only one file is permitted");
                errorOnFile = $LL.mapEditor.entityEditor.uploadEntity.errorOnFileNumber();
            } else {
                if (isASupportedFormat(filesFromDropEvent.item(0)?.type ?? "")) {
                    const file = filesFromDropEvent.item(0);
                    if (file) {
                        acceptAsset(file, file.name);
                    }
                } else {
                    console.error("File format not supported");
                    errorOnFile = $LL.mapEditor.entityEditor.uploadEntity.errorOnFileFormat();
                }
            }
        }
        dropZoneRef?.classList.remove("border-cyan-400");
    }

    onDestroy(() => {
        savedAssetsController.abort();
        mapEditorEntityUploadDraftStoreUnsubscriber();
        if (uploadDraft === undefined && selectedAsset) {
            URL.revokeObjectURL(selectedAsset.previewUrl);
        }
    });
</script>

{#if customEntityToUpload}
    <div class="absolute top-0 left-0 w-full bg-contrast/80 backdrop-blur p-8 h-full overflow-auto">
        <CustomEntityEditionForm
            isUploadForm
            disabled={uploadDraft?.status === "submitting"}
            customEntity={customEntityToUpload}
            closeForm={initFileUpload}
            applyEntityModifications={(customModifiedEntity) =>
                processFileToUpload(customModifiedEntity).catch((e) => console.error(e))}
        />
        {#if uploadDraft?.status === "failed"}
            <p class="text-xs text-red-500" data-testid="entityUploadError" aria-live="polite">
                {uploadDraft.error}
            </p>
        {/if}
    </div>
{:else}
    <div class="no-padding">
        <p class="m-0">{$LL.mapEditor.entityEditor.uploadEntity.title()}</p>
        <p class="opacity-50">{$LL.mapEditor.entityEditor.uploadEntity.description()}</p>
        {#if savedAssetsLoading && savedAssets.length === 0}
            <p class="mt-3 text-xs opacity-60">Loading your saved generated assets…</p>
        {:else if savedAssets.length > 0}
            <section class="my-3 rounded-md border border-white/10 bg-white/5 p-3" aria-label="Saved generated assets">
                <p class="m-0 text-sm font-semibold">Saved AI assets</p>
                <p class="mt-1 text-xs opacity-60">
                    Open one to configure its name, tags, depth, and collision before uploading it into this map.
                </p>
                <div class="mt-2 grid max-h-40 grid-cols-3 gap-2 overflow-y-auto">
                    {#each savedAssets as asset (asset.id)}
                        <button
                            type="button"
                            class="rounded border border-white/10 bg-black/20 p-2 text-left hover:border-cyan-300 disabled:opacity-50"
                            disabled={savedAssetsLoading}
                            onclick={() => reuseSavedAsset(asset)}
                        >
                            <img
                                class="h-16 w-full object-contain [image-rendering:pixelated]"
                                src={asset.url}
                                alt=""
                            />
                            <span class="mt-1 block truncate text-xs">{asset.name}</span>
                        </button>
                    {/each}
                </div>
            </section>
        {/if}
        {#if savedAssetsError}
            <p class="my-2 text-xs text-red-500" aria-live="polite">{savedAssetsError}</p>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            ondrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dropHandler(event);
            }}
            ondragover={(event) => {
                event.preventDefault();
                dropZoneRef?.classList.add("border-cyan-400");
            }}
            ondragleave={(event) => {
                event.preventDefault();
                dropZoneRef?.classList.remove("border-cyan-400");
            }}
            bind:this={dropZoneRef}
            class="hover:cursor-pointer h-32 flex flex-col border border-dashed rounded-md items-center justify-center bg-white/10"
        >
            <input
                id="upload"
                class="hidden"
                type="file"
                accept={ENTITY_UPLOAD_SUPPORTED_FORMATS_FRONT}
                bind:files
                data-testid="uploadCustomAsset"
            />

            <label class="flex flex-row gap-2 min-w-full p-2 m-0 items-center justify-center" for="upload">
                <IconCloudUpload font-size={32} />
                <span class="flex flex-col">
                    <span class="hover:cursor-pointer">
                        {$LL.mapEditor.entityEditor.uploadEntity.dragDrop()}
                        <span class="hover:cursor-pointer underline text-contrast-300"
                            >{$LL.mapEditor.entityEditor.uploadEntity.chooseFile()}</span
                        >
                    </span>
                    <span class="text-xs m-0 opacity-50">PNG, JPG, WebP</span>
                    {#if errorOnFile}
                        <span class="text-xx text-red-500">{errorOnFile}</span>
                    {/if}
                </span></label
            >
        </div>
        <div class="mt-4">
            <AssetGenerationPanel
                target="environment-object"
                title="Generate a map object"
                promptPlaceholder="A mossy community notice board with small pinned cards, viewed from above…"
                promptGuidance="Create an object here, then use the existing collision, depth, tags, and interaction controls before placing it."
                outputSize={{ width: 512, height: 512 }}
                onAccept={({ blob }) => acceptAsset(blob, `generated-${uuidv4()}.png`)}
            />
        </div>
    </div>
{/if}
