<script lang="ts">
    import { CustomEntityDirection } from "@workadventure/messages";
    import { onDestroy, onMount } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { v4 as uuidv4 } from "uuid";
    import type { EntityPrefab, VisualAssetAnimation } from "@workadventure/map-editor";
    import { Direction, ENTITY_UPLOAD_SUPPORTED_FORMATS_FRONT } from "@workadventure/map-editor";
    import AssetGenerationPanel from "../../../AssetGeneration/AssetGenerationPanel.svelte";
    import AnimatedAssetPreview from "../../../AssetGeneration/AnimatedAssetPreview.svelte";
    import { teapotGeneratedAssetApi } from "../../../../Services/TeapotGeneratedAssetApi";
    import { GeneratedAssetLocalStore } from "../../../../Services/GeneratedAssetLocalStore";
    import {
        GeneratedMapAssetController,
        generatedAssetOwnerScope,
        type AcceptedGeneratedMapAsset,
        type GeneratedMapAssetCard,
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
    }

    let { generatedAsset, generatedAssetName = "generated-entity.png" }: Props = $props();

    let files: FileList | undefined = $state(undefined);
    let dropZoneRef: HTMLDivElement | undefined = $state();
    let customEntityToUpload: EntityPrefab | undefined = $state(undefined);
    let errorOnFile: string | undefined = $state();
    let selectedAsset:
        | { source: Blob; name: string; previewUrl: string; animation?: VisualAssetAnimation }
        | undefined = $state(undefined);
    let uploadDraft: MapEditorEntityUploadDraft | undefined = $state(undefined);
    let consumedGeneratedAsset: Blob | File | undefined;
    let savedAssets: GeneratedMapAssetCard[] = $state([]);
    let savedAssetsLoading = $state(false);
    let savedAssetsError = $state<string>();
    let savedAssetItemErrors: Record<string, string> = $state({});
    const savedAssetsController = new AbortController();
    let generatedAssetController: GeneratedMapAssetController | undefined;
    let persistedGeneratedAsset: Blob | undefined;
    const savedAssetPreviewUrls = new SvelteMap<string, { blob: Blob; url: string }>();

    const BASIC_TYPE = "Custom";

    onMount(() => {
        savedAssetsLoading = true;
        const token = localUserStore.getAuthToken();
        const ownerScope = generatedAssetOwnerScope(token, localUserStore.getLocalUser()?.uuid);
        generatedAssetController = new GeneratedMapAssetController(
            ownerScope,
            ownerScope !== "anonymous",
            new GeneratedAssetLocalStore(),
            teapotGeneratedAssetApi,
            ({ items, warning }) => {
                replaceSavedAssets(items);
                savedAssetsError = warning;
            },
        );
        generatedAssetController.hydrate(savedAssetsController.signal).then(
            () => {
                savedAssetsLoading = false;
            },
            (reason: unknown) => {
                savedAssetsLoading = false;
                if (reason instanceof DOMException && reason.name === "AbortError") return;
                savedAssetsError = reason instanceof Error ? reason.message : "Saved assets could not be loaded.";
            },
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
        customEntityToUpload = {
            collectionName: "custom entities",
            name,
            imagePath: previewUrl,
            id: uuidv4(),
            direction: Direction.Down,
            tags: [],
            color: "",
            type: BASIC_TYPE,
            animation,
        };
        errorOnFile = undefined;
    }

    async function reuseSavedAsset(asset: GeneratedMapAssetCard): Promise<void> {
        savedAssetItemErrors = { ...savedAssetItemErrors, [asset.key]: "" };
        try {
            const blob = await generatedAssetController?.open(asset, savedAssetsController.signal);
            if (blob !== undefined) acceptAsset(blob, savedAssetFileName(asset), asset.animation);
        } catch (reason: unknown) {
            if (reason instanceof DOMException && reason.name === "AbortError") return;
            savedAssetItemErrors = {
                ...savedAssetItemErrors,
                [asset.key]: reason instanceof Error ? reason.message : "Saved asset could not be opened.",
            };
        }
    }

    async function persistGeneratedAsset(asset: AcceptedGeneratedMapAsset): Promise<void> {
        if (generatedAssetController === undefined) throw new Error("Generated asset storage is not ready yet.");
        await generatedAssetController.saveGenerated(asset, savedAssetsController.signal);
        persistedGeneratedAsset = asset.blob;
    }

    async function acceptGeneratedAsset(asset: AcceptedGeneratedMapAsset): Promise<void> {
        if (persistedGeneratedAsset !== asset.blob) await persistGeneratedAsset(asset);
        acceptAsset(asset.blob, `generated-${uuidv4()}.png`, asset.animation);
    }

    async function retrySavedAsset(asset: GeneratedMapAssetCard): Promise<void> {
        if (asset.local === undefined) return;
        savedAssetItemErrors = { ...savedAssetItemErrors, [asset.key]: "" };
        try {
            await generatedAssetController?.retry(asset.local.clientId, savedAssetsController.signal);
        } catch (reason: unknown) {
            savedAssetItemErrors = {
                ...savedAssetItemErrors,
                [asset.key]: reason instanceof Error ? reason.message : "Upload retry failed.",
            };
        }
    }

    function replaceSavedAssets(items: GeneratedMapAssetCard[]): void {
        const nextKeys = new Set(items.map((item) => item.key));
        for (const [key, preview] of savedAssetPreviewUrls) {
            if (!nextKeys.has(key)) {
                URL.revokeObjectURL(preview.url);
                savedAssetPreviewUrls.delete(key);
            }
        }
        savedAssets = items;
    }

    function savedAssetPreview(asset: GeneratedMapAssetCard): string {
        if (asset.blob === undefined) return asset.remote?.url ?? "";
        const existing = savedAssetPreviewUrls.get(asset.key);
        if (existing?.blob === asset.blob) return existing.url;
        if (existing !== undefined) URL.revokeObjectURL(existing.url);
        const url = URL.createObjectURL(asset.blob);
        savedAssetPreviewUrls.set(asset.key, { blob: asset.blob, url });
        return url;
    }

    function savedAssetFileName(asset: GeneratedMapAssetCard): string {
        return `${asset.remote?.id ?? asset.local?.clientId ?? "saved"}-${asset.name.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 48)}.png`;
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
        for (const preview of savedAssetPreviewUrls.values()) URL.revokeObjectURL(preview.url);
        savedAssetPreviewUrls.clear();
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
        {#if savedAssetsLoading && savedAssets.length === 0}
            <p class="mt-3 text-xs opacity-60">Loading your saved generated assets…</p>
        {:else if savedAssets.length > 0}
            <section class="my-3 rounded-md border border-white/10 bg-white/5 p-3" aria-label="Saved generated assets">
                <p class="m-0 text-sm font-semibold">Saved AI assets</p>
                <p class="mt-1 text-xs opacity-60">
                    Open one to configure its name, tags, depth, and collision before uploading it into this map.
                </p>
                <div class="mt-2 grid max-h-40 grid-cols-3 gap-2 overflow-y-auto">
                    {#each savedAssets as asset (asset.key)}
                        <div class="rounded border border-white/10 bg-black/20 p-2">
                            <button
                                type="button"
                                class="w-full text-left hover:opacity-80"
                                onclick={() => reuseSavedAsset(asset)}
                            >
                                <AnimatedAssetPreview
                                    classNames="h-16 w-full object-contain [image-rendering:pixelated]"
                                    imageSource={savedAssetPreview(asset)}
                                    imageAlt={asset.name}
                                    animation={asset.animation}
                                />
                                <span class="mt-1 block truncate text-xs">{asset.name}</span>
                            </button>
                            {#if asset.local?.syncStatus === "pending"}
                                <span class="text-[10px] opacity-60">Saving online…</span>
                            {:else if asset.local?.syncStatus === "failed"}
                                <button
                                    type="button"
                                    class="text-[10px] text-cyan-300 underline"
                                    onclick={() => retrySavedAsset(asset)}>Retry upload</button
                                >
                                <span class="block text-[10px] text-red-400">{asset.local.syncError}</span>
                            {/if}
                            {#if savedAssetItemErrors[asset.key]}
                                <span class="block text-[10px] text-red-400">{savedAssetItemErrors[asset.key]}</span>
                                <button
                                    type="button"
                                    class="text-[10px] text-cyan-300 underline"
                                    onclick={() => reuseSavedAsset(asset)}>Retry open</button
                                >
                            {/if}
                        </div>
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
        <div class="mt-3">
            <AssetGenerationPanel
                target="environment-object"
                title="Generate with AI"
                promptPlaceholder="A mossy community notice board with small pinned cards, viewed from above…"
                compact
                outputSize={{ width: 512, height: 512 }}
                onGenerated={persistGeneratedAsset}
                onAccept={acceptGeneratedAsset}
            />
        </div>
    </div>
{/if}
