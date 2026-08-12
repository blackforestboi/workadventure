<script lang="ts">
    import { CustomEntityDirection } from "@workadventure/messages";
    import { onDestroy, onMount } from "svelte";
    import { v4 as uuidv4 } from "uuid";
    import type { EntityPrefab, VisualAssetAnimation } from "@workadventure/map-editor";
    import { Direction, ENTITY_UPLOAD_SUPPORTED_FORMATS_FRONT } from "@workadventure/map-editor";
    import AssetGenerationPanel from "../../../AssetGeneration/AssetGenerationPanel.svelte";
    import { teapotGeneratedAssetApi } from "../../../../Services/TeapotGeneratedAssetApi";
    import { GeneratedAssetLocalStore } from "../../../../Services/GeneratedAssetLocalStore";
    import {
        GeneratedMapAssetController,
        generatedAssetOwnerScope,
        type AcceptedGeneratedMapAsset,
    } from "../../../../Services/GeneratedMapAssetController";
    import { localUserStore } from "../../../../Connection/LocalUserStore";
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
        onClose?: () => void;
    }

    let { generatedAsset, generatedAssetName = "generated-entity.png", onClose }: Props = $props();

    let files: FileList | undefined = $state(undefined);
    let dropZoneRef: HTMLDivElement | undefined = $state();
    let customEntityToUpload: EntityPrefab | undefined = $state(undefined);
    let errorOnFile: string | undefined = $state();
    let selectedAsset:
        | { source: Blob; name: string; previewUrl: string; animation?: VisualAssetAnimation }
        | undefined = $state(undefined);
    let uploadDraft: MapEditorEntityUploadDraft | undefined = $state(undefined);
    let consumedGeneratedAsset: Blob | File | undefined;
    const generatedAssetsController = new AbortController();
    let generatedAssetController: GeneratedMapAssetController | undefined;
    let persistedGeneratedAsset: Blob | undefined;

    const BASIC_TYPE = "Custom";

    onMount(() => {
        const token = localUserStore.getAuthToken();
        const ownerScope = generatedAssetOwnerScope(token, localUserStore.getLocalUser()?.uuid);
        generatedAssetController = new GeneratedMapAssetController(
            ownerScope,
            ownerScope !== "anonymous",
            new GeneratedAssetLocalStore(),
            teapotGeneratedAssetApi,
            () => undefined,
        );
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
            animation: draft.uploadEntityMessage.animation,
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
        closeToCustomAssets(draft.commandId);
    }

    function closeToCustomAssets(commandId?: string) {
        initFileUpload(commandId);
        selectCategoryStore.set({ kind: "special", tag: "custom" });
        onClose?.();
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
                    defaultSizeInTiles: customEditedEntity.defaultSizeInTiles,
                    defaultHeightInTiles: customEditedEntity.defaultHeightInTiles,
                    previewPadding: customEditedEntity.previewPadding,
                    color: "",
                    animation: customEditedEntity.animation,
                },
            });
        }
    }

    function acceptAsset(source: Blob, name: string, animation?: VisualAssetAnimation) {
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
        selectedAsset = { source, name, previewUrl, animation };
        errorOnFile = undefined;
    }

    function startEditingSelectedAsset() {
        if (!selectedAsset) return;
        customEntityToUpload = {
            collectionName: "custom entities",
            name: selectedAsset.name,
            imagePath: selectedAsset.previewUrl,
            id: uuidv4(),
            direction: Direction.Down,
            tags: [],
            color: "",
            type: BASIC_TYPE,
            animation: selectedAsset.animation,
        };
    }

    async function persistGeneratedAsset(asset: AcceptedGeneratedMapAsset): Promise<void> {
        if (generatedAssetController === undefined) throw new Error("Generated asset storage is not ready yet.");
        await generatedAssetController.saveGenerated(asset, generatedAssetsController.signal);
        persistedGeneratedAsset = asset.blob;
    }

    async function acceptGeneratedAsset(asset: AcceptedGeneratedMapAsset): Promise<void> {
        if (persistedGeneratedAsset !== asset.blob) await persistGeneratedAsset(asset);
        acceptAsset(asset.blob, asset.title ?? `generated-${uuidv4()}.png`, asset.animation);
        startEditingSelectedAsset();
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
        generatedAssetsController.abort();
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
            closeForm={closeToCustomAssets}
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
        {#if selectedAsset}
            <div class="mt-3 flex justify-center rounded-md border border-white/10 bg-black/20 p-2">
                <img
                    src={selectedAsset.previewUrl}
                    alt={selectedAsset.name}
                    class="max-h-40 max-w-full object-contain"
                />
            </div>
        {/if}
        <div class="mt-3">
            <AssetGenerationPanel
                target="environment-object"
                title={selectedAsset ? "Modify with AI" : "Generate with AI"}
                promptPlaceholder="A mossy community notice board with small pinned cards, viewed from above…"
                compact
                outputSize={{ width: 512, height: 512 }}
                onGenerated={persistGeneratedAsset}
                onUseImage={selectedAsset ? startEditingSelectedAsset : undefined}
                onAccept={acceptGeneratedAsset}
            />
        </div>
    </div>
{/if}
