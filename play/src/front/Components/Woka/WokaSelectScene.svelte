<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { localUserStore } from "../../Connection/LocalUserStore";
    import { ABSOLUTE_PUSHER_URL } from "../../Enum/ComputedConst";
    import { teapotWokaApi } from "../../Services/TeapotWokaApi";
    import type { TeapotWokaView } from "../../Services/TeapotWokaApi";
    import {
        forgetGeneratedWoka,
        loadRememberedGeneratedWokas,
        rememberGeneratedWoka,
    } from "../../Services/GeneratedWokaLocalStore";
    import { assetGenerationSettings } from "../../Services/AssetGeneration/AssetGenerationSettings";
    import { loadArchivedAvatarGenerationDrafts } from "../../Services/AssetGeneration/AvatarGenerationDraftStore";
    import { aiGenerationSettingsVisibilityStore } from "../../Stores/AiGenerationSettingsVisibilityStore";
    import AvatarGenerationWizard from "../AssetGeneration/AvatarGenerationWizard.svelte";
    import Button from "../UI/Button.svelte";
    import WokaPreview from "./WokaPreview.svelte";
    import type { WokaCollection, WokaData, WokaTexture } from "./WokaTypes";
    import { getItemsPerRow } from "./ItemsPerRow";
    import WokaImage from "./WokaImage.svelte";
    import {
        addGeneratedWokaAsset,
        findWokaTextureCollectionIndex,
        generatedWokaName,
        isGeneratedWokaTexture,
        removeGeneratedWokaAsset,
    } from "./WokaGeneratedAssets";
    import { isEditableKeyboardTarget } from "./WokaKeyboardNavigation";
    import { IconShuffle } from "@wa-icons";

    /* eslint-disable svelte/require-each-key */

    interface Props {
        customize: () => void;
        saveAndContinue: (texturesId: string[]) => void;
    }

    let { customize, saveAndContinue }: Props = $props();

    let wokaData: WokaData | null = $state(null);
    let currentWokaCollection: WokaCollection | null = null;
    let selectedWokaTextureId: Record<string, string> = $state({});
    let isLoading = $state(true);
    let error = $state("");
    let generatedAssetError = $state("");
    let generatedWokas: TeapotWokaView[] = $state([]);
    // Full sheets cached in this browser are a recovery source when the local
    // pusher catalog has been restarted or is temporarily unavailable.
    const recoveredGeneratedSheets = new Map<string, Blob>();
    const recoveredGeneratedUrls = new Map<string, string>();
    let showGenerator = $state(false);
    let openGeneratorAfterConnection = $state(false);
    let connectionOverlayWasOpen = $state(false);
    let editingWoka: { asset: TeapotWokaView; sheet: Blob } | null = $state(null);
    let openingEditorId = $state("");
    let assetsDirection: number = $state(0);
    let selectionVersion = 0;
    let uploadVersion = 0;
    let uploadController: AbortController | null = null;
    let destroyed = false;

    async function loadWokaData() {
        try {
            isLoading = true;
            error = "";
            generatedAssetError = "";
            const roomUrl = gameManager.currentStartedRoom.href;
            const response = await fetch(`${ABSOLUTE_PUSHER_URL}woka/list?roomUrl=${encodeURIComponent(roomUrl)}`, {
                headers: {
                    Authorization: localUserStore.getAuthToken() || "",
                },
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to load Woka data");
            }

            wokaData = (await response.json()) as WokaData;

            await restoreGeneratedWokaCatalog();

            loadSavedTextures();
        } catch (err) {
            console.error("Error loading Woka data:", err);
            error = "Failed to load Woka customization data";
        } finally {
            isLoading = false;
        }
    }

    async function restoreGeneratedWokaCatalog(): Promise<void> {
        const remembered = loadRememberedGeneratedWokas();
        const archived = await loadArchivedAvatarGenerationDrafts().catch(() => []);
        const localFallbacks = new Map<string, Blob>();
        for (const entry of remembered) localFallbacks.set(entry.asset.id, entry.png);
        for (const draft of archived) {
            if (!localFallbacks.has(draft.assetId) && draft.finalBlob !== null) {
                localFallbacks.set(draft.assetId, draft.finalBlob);
            }
        }

        let remote: TeapotWokaView[] = [];
        try {
            remote = (await teapotWokaApi.list()).items;
        } catch (reason) {
            if (localFallbacks.size === 0) {
                generatedAssetError = errorMessage(reason, "Generated avatars are temporarily unavailable.");
            }
        }

        const remoteIds = new Set(remote.map((asset) => asset.id));
        const recovered = [...localFallbacks.entries()]
            .filter(([id]) => !remoteIds.has(id))
            .map(([id, sheet]) => ({
                id,
                name: `Avatar: ${archived.find((draft) => draft.assetId === id)?.description || "Recovered avatar"}`,
                url: "",
                category: "woka" as const,
                active: false,
                createdAt: new Date(0).toISOString(),
                sheet,
            }));

        recoveredGeneratedSheets.clear();
        for (const [id, sheet] of localFallbacks) recoveredGeneratedSheets.set(id, sheet);
        generatedWokas = [...remote, ...recovered.map(({ sheet: _sheet, ...asset }) => asset)];

        if (wokaData === null) return;
        revokeRecoveredGeneratedUrls();
        for (const asset of generatedWokas.filter((candidate) => candidate.category === "woka")) {
            const localSheet = recoveredGeneratedSheets.get(asset.id);
            const displayAsset =
                localSheet !== undefined && !remoteIds.has(asset.id)
                    ? { ...asset, url: createRecoveredGeneratedUrl(asset.id, localSheet) }
                    : asset;
            wokaData = addGeneratedWokaAsset(wokaData, displayAsset);
        }
    }

    function createRecoveredGeneratedUrl(assetId: string, sheet: Blob): string {
        const existing = recoveredGeneratedUrls.get(assetId);
        if (existing !== undefined) return existing;
        const url = URL.createObjectURL(sheet);
        recoveredGeneratedUrls.set(assetId, url);
        return url;
    }

    function revokeRecoveredGeneratedUrls(): void {
        for (const url of recoveredGeneratedUrls.values()) URL.revokeObjectURL(url);
        recoveredGeneratedUrls.clear();
    }

    function loadSavedTextures() {
        try {
            const savedTextureIds = gameManager.getCharacterTextureIds();
            // find the collection used to select the Woka
            const collectionIndex = wokaData?.["woka"]?.collections.findIndex((c: WokaCollection) =>
                c.textures.find((t: WokaTexture) => t.id === savedTextureIds?.[0]),
            );
            if (collectionIndex === undefined || collectionIndex < 0) {
                throw new Error("No valid Woka collection found for the saved texture ID");
            }
            selectTextureLocally(
                collectionIndex,
                savedTextureIds != null
                    ? savedTextureIds[0]
                    : wokaData?.["woka"]?.collections?.[0]?.textures?.[0]?.id || "",
            );

            // Scroll to the selected collection
            setTimeout(() => {
                const element = document.getElementById(`woka-${selectedWokaTextureId["woka"]}`);
                if (element == undefined) return;
                element.scrollIntoView({ behavior: "smooth", block: "end" });
            }, 800);
        } catch (err) {
            console.warn("Cannot load previous WOKA textures:", err);
            const activeGeneratedTexture = generatedWokas.find(
                (asset) => asset.active && asset.category === "woka",
            )?.id;
            const activeCollectionIndex =
                wokaData && activeGeneratedTexture
                    ? findWokaTextureCollectionIndex(wokaData, "woka", activeGeneratedTexture)
                    : -1;
            if (activeGeneratedTexture && activeCollectionIndex >= 0) {
                selectTextureLocally(activeCollectionIndex, activeGeneratedTexture);
            } else {
                selectTextureLocally(0, wokaData?.["woka"]?.collections?.[0]?.textures?.[0]?.id || "");
            }
        }
    }

    function selectTextureLocally(collectionIndex: number, textureId: string) {
        // check that the textureId is existing in the wokaData
        if (!wokaData || !wokaData["woka"] || !wokaData["woka"].collections) {
            console.error("Woka data is not loaded or invalid");
            throw new Error("Woka data is not loaded or invalid");
        }
        const collection = wokaData["woka"].collections[collectionIndex];
        if (collection === undefined) {
            throw new Error(`Woka collection ${collectionIndex} does not exist`);
        }
        const textures = collection.textures;
        if (!textures.some((texture: WokaTexture) => texture.id === textureId)) {
            console.error(`Texture ID ${textureId} does not exist in the Woka data`);
            throw new Error(`Texture ID ${textureId} does not exist in the Woka data`);
        }

        selectedWokaTextureId = { woka: textureId }; // Trigger reactivity
        currentWokaCollection = collection;
    }

    async function selectTexture(collectionIndex: number, textureId: string) {
        const version = ++selectionVersion;
        generatedAssetError = "";
        if (isGeneratedWokaTexture(textureId)) {
            try {
                const selected = await teapotWokaApi.select(textureId);
                if (destroyed || version !== selectionVersion) return;
                generatedWokas = generatedWokas.map((asset) => ({ ...asset, active: asset.id === selected.id }));
            } catch (reason) {
                if (recoveredGeneratedSheets.has(textureId)) {
                    selectTextureLocally(collectionIndex, textureId);
                    return;
                }
                if (version === selectionVersion) {
                    generatedAssetError = errorMessage(reason, "The generated avatar could not be selected.");
                }
                return;
            }
        }
        if (destroyed || version !== selectionVersion) return;
        selectTextureLocally(collectionIndex, textureId);
    }

    async function acceptGeneratedWoka(
        blob: Blob,
        prompt: string,
        replacedAsset?: TeapotWokaView,
    ): Promise<string | undefined> {
        uploadController?.abort();
        const controller = new AbortController();
        uploadController = controller;
        const version = ++uploadVersion;
        const selectionAtStart = selectionVersion;
        generatedAssetError = "";
        try {
            const accepted = await teapotWokaApi.upload(
                blob,
                generatedWokaName("woka", prompt),
                "woka",
                controller.signal,
            );
            await rememberGeneratedWoka(accepted, blob);
            if (replacedAsset !== undefined) {
                try {
                    await teapotWokaApi.delete(replacedAsset.id, controller.signal);
                    forgetGeneratedWoka(replacedAsset.id);
                } catch (reason) {
                    generatedAssetError = errorMessage(
                        reason,
                        "The updated avatar was saved, but the previous version could not be removed.",
                    );
                }
            }
            if (!destroyed && !controller.signal.aborted && version === uploadVersion && wokaData !== null) {
                if (replacedAsset !== undefined) {
                    wokaData = removeGeneratedWokaAsset(wokaData, replacedAsset);
                }
                wokaData = addGeneratedWokaAsset(wokaData, accepted);
                generatedWokas = [
                    accepted,
                    ...generatedWokas.filter((asset) => asset.id !== accepted.id && asset.id !== replacedAsset?.id),
                ].map((asset) => ({
                    ...asset,
                    active: asset.id === accepted.id,
                }));
                if (selectionAtStart === selectionVersion) {
                    const collectionIndex = findWokaTextureCollectionIndex(wokaData, "woka", accepted.id);
                    selectTextureLocally(collectionIndex, accepted.id);
                }
            }
            return accepted.id;
        } catch (reason) {
            if (!controller.signal.aborted) throw reason;
        } finally {
            if (uploadController === controller) uploadController = null;
        }
        return undefined;
    }

    async function openGeneratedWokaEditor(asset: TeapotWokaView, collectionIndex: number): Promise<void> {
        generatedAssetError = "";
        openingEditorId = asset.id;
        try {
            await selectTexture(collectionIndex, asset.id);
            const locallyRecovered = recoveredGeneratedSheets.get(asset.id);
            const sheet =
                locallyRecovered ??
                (await (async () => {
                    const response = await fetch(getTextureUrl(asset.url), {
                        credentials: "include",
                        cache: "no-store",
                    });
                    if (!response.ok) throw new Error(`The generated avatar could not be loaded (${response.status}).`);
                    return response.blob();
                })());
            editingWoka = { asset, sheet };
            showGenerator = true;
        } catch (reason) {
            generatedAssetError = errorMessage(reason, "The generated avatar could not be opened for editing.");
        } finally {
            openingEditorId = "";
        }
    }

    function openNewAvatarGenerator(): void {
        editingWoka = null;
        if (assetGenerationSettings.getReadySelection() !== undefined) {
            showGenerator = true;
            return;
        }

        openGeneratorAfterConnection = true;
        connectionOverlayWasOpen = false;
        aiGenerationSettingsVisibilityStore.open();
    }

    $effect(() => {
        const settingsOpen = $aiGenerationSettingsVisibilityStore;
        const connected =
            $assetGenerationSettings.lifecycle === "connected" &&
            assetGenerationSettings.getReadySelection() !== undefined;

        if (openGeneratorAfterConnection && connected) {
            openGeneratorAfterConnection = false;
            connectionOverlayWasOpen = false;
            aiGenerationSettingsVisibilityStore.close();
            showGenerator = true;
            return;
        }

        if (openGeneratorAfterConnection && connectionOverlayWasOpen && !settingsOpen) {
            openGeneratorAfterConnection = false;
            connectionOverlayWasOpen = false;
            return;
        }

        if (openGeneratorAfterConnection && settingsOpen) {
            connectionOverlayWasOpen = true;
        }
    });

    function closeAvatarGenerator(): void {
        showGenerator = false;
        editingWoka = null;
    }

    async function deleteGeneratedWoka(asset: TeapotWokaView) {
        if (!window.confirm(`Delete “${asset.name}” from your generated avatars?`)) return;
        generatedAssetError = "";
        try {
            await teapotWokaApi.delete(asset.id);
            forgetGeneratedWoka(asset.id);
            recoveredGeneratedSheets.delete(asset.id);
            if (destroyed || wokaData === null) return;
            const deletedSelectedTexture = selectedWokaTextureId.woka === asset.id;
            wokaData = removeGeneratedWokaAsset(wokaData, asset);
            generatedWokas = generatedWokas.filter((candidate) => candidate.id !== asset.id);
            if (deletedSelectedTexture) {
                const fallback = wokaData.woka.collections[0]?.textures[0];
                if (fallback !== undefined) selectTextureLocally(0, fallback.id);
            } else {
                const selectedCollectionIndex = findWokaTextureCollectionIndex(
                    wokaData,
                    "woka",
                    selectedWokaTextureId.woka,
                );
                if (selectedCollectionIndex >= 0) {
                    currentWokaCollection = wokaData.woka.collections[selectedCollectionIndex];
                }
            }
        } catch (reason) {
            generatedAssetError = errorMessage(reason, "The generated avatar could not be deleted.");
        }
    }

    function generatedAsset(textureId: string): TeapotWokaView | undefined {
        return generatedWokas.find((asset) => asset.id === textureId);
    }

    function randomizeOutfit() {
        if (!wokaData) return;
        const randomCollectionIndex = Math.floor(Math.random() * wokaData["woka"].collections.length);
        const collection = wokaData["woka"].collections[randomCollectionIndex];
        if (collection === undefined || collection.textures.length === 0) return;
        const randomTexture = collection.textures[Math.floor(Math.random() * collection.textures.length)];
        if (randomTexture === undefined) return;
        selectTexture(randomCollectionIndex, randomTexture.id).catch(() => undefined);
    }

    async function saveSelectedWokaAndContinue(): Promise<void> {
        const selectedTextureId = selectedWokaTextureId.woka;
        const recovered = recoveredGeneratedSheets.get(selectedTextureId);
        if (recovered === undefined) {
            saveAndContinue([selectedTextureId]);
            return;
        }

        const asset = generatedAsset(selectedTextureId);
        if (asset === undefined) return;
        generatedAssetError = "";
        try {
            const accepted = await teapotWokaApi.upload(recovered, asset.name, "woka");
            await rememberGeneratedWoka(accepted, recovered);
            if (wokaData !== null) {
                wokaData = addGeneratedWokaAsset(removeGeneratedWokaAsset(wokaData, asset), accepted);
                generatedWokas = [accepted, ...generatedWokas.filter((candidate) => candidate.id !== asset.id)];
                recoveredGeneratedSheets.delete(asset.id);
                const oldUrl = recoveredGeneratedUrls.get(asset.id);
                if (oldUrl !== undefined) URL.revokeObjectURL(oldUrl);
                recoveredGeneratedUrls.delete(asset.id);
                const collectionIndex = findWokaTextureCollectionIndex(wokaData, "woka", accepted.id);
                selectTextureLocally(collectionIndex, accepted.id);
                saveAndContinue([accepted.id]);
            }
        } catch (reason) {
            generatedAssetError = errorMessage(reason, "The recovered avatar could not be restored to the server.");
        }
    }

    function getTextureUrl(relativeUrl: string): string {
        if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
            return relativeUrl;
        }

        return new URL(relativeUrl, ABSOLUTE_PUSHER_URL).toString();
    }

    let enterPressed = false;

    // Function to validate character textures
    function useKeyBoardNavigation(event: KeyboardEvent) {
        if (isEditableKeyboardTarget(event.target)) return;
        if (!wokaData || !currentWokaCollection) return;
        if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight" ||
            event.key === "ArrowUp" ||
            event.key === "ArrowDown"
        ) {
            event.preventDefault();
            const currentCollectionIndex = wokaData?.["woka"]?.collections.findIndex(
                (c: WokaCollection) => c.name === currentWokaCollection?.name,
            );
            if (currentCollectionIndex === undefined || currentCollectionIndex < 0) return;

            const textures = wokaData["woka"].collections[currentCollectionIndex].textures;
            const currentTextureIndex = textures.findIndex((t: WokaTexture) => t.id === selectedWokaTextureId["woka"]);

            let newIndex = currentCollectionIndex;
            if (event.key === "ArrowLeft") {
                newIndex = Math.max(currentTextureIndex - 1, 0);
            } else if (event.key === "ArrowRight") {
                newIndex = Math.min(currentTextureIndex + 1, textures.length - 1);
            } else if (event.key === "ArrowUp") {
                const itemsPerRow = getItemsPerRow(document.getElementById(`woka-line-0`));
                newIndex = Math.max(currentTextureIndex - itemsPerRow, 0);
            } else if (event.key === "ArrowDown") {
                const itemsPerRow = getItemsPerRow(document.getElementById(`woka-line-0`));
                newIndex = Math.min(currentTextureIndex + itemsPerRow, textures.length - 1);
            }
            if (newIndex !== currentTextureIndex) {
                selectTexture(currentCollectionIndex, textures[newIndex].id).catch(() => undefined);
                // Scroll to the newly selected texture
                const element = document.getElementById(`woka-${textures[newIndex].id}`);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
                }
            }
        } else if (event.key === "Enter") {
            enterPressed = true;
        }
    }

    function useKeyBoardNavigationUp(event: KeyboardEvent) {
        if (!wokaData || !currentWokaCollection) return;
        if (event.key === "Enter" && enterPressed) {
            enterPressed = false;
            saveAndContinue([selectedWokaTextureId["woka"]]); // Save and continue when Enter is pressed
        }
    }

    onMount(() => {
        loadWokaData().catch((err) => {
            console.error("Error in onMount while loading Woka data:", err);
        });
        document.addEventListener("keydown", useKeyBoardNavigation);
        document.addEventListener("keyup", useKeyBoardNavigationUp);
    });

    onDestroy(() => {
        destroyed = true;
        selectionVersion += 1;
        uploadVersion += 1;
        uploadController?.abort();
        revokeRecoveredGeneratedUrls();
        document.removeEventListener("keydown", useKeyBoardNavigation);
        document.removeEventListener("keyup", useKeyBoardNavigationUp);
    });

    function errorMessage(reason: unknown, fallback: string): string {
        return reason instanceof Error ? reason.message : fallback;
    }
</script>

<div class="mobile-webkit bg-contrast w-screen md:!mt-[15vh] h-full md:!h-[70vh] flex items-center justify-center">
    <div
        class="mobile-webkit rounded-lg flex flex-col max-w-4xl w-full h-full m-4 relative bg-white/10 backdrop-blur-md"
    >
        {#if isLoading}
            <div class="flex items-center justify-center h-64">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        {:else if error}
            <div class="text-center text-red-600 mb-4">
                <p>{error}</p>
                <button class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" onclick={loadWokaData}>
                    Retry
                </button>
            </div>
        {:else}
            <div class="flex-1 flex flex-col sm:flex-row items-start gap-6 min-h-0 p-6">
                <div class="flex flex-row gap-4 w-full sm:w-fit">
                    <div class="flex flex-col gap-2">
                        <WokaPreview
                            selectedTextures={selectedWokaTextureId}
                            {wokaData}
                            {getTextureUrl}
                            onrotate={(direction) => {
                                assetsDirection = direction;
                            }}
                        />

                        <div class="mt-4 space-y-2">
                            <Button
                                size="sm"
                                variant="light"
                                appearance="border"
                                class="w-full px-4 py-2 text-white rounded hover:bg-white/10 flex flex-row items-center gap-2"
                                onclick={randomizeOutfit}
                            >
                                {#snippet icon()}
                                    <IconShuffle font-size="20" class="text-white" />
                                {/snippet}
                                <span>{$LL.woka.selectWoka.randomize()}</span>
                            </Button>
                            <Button
                                size="sm"
                                variant="light"
                                appearance="border"
                                class="w-full px-4 py-2 text-white rounded hover:bg-white/10"
                                onclick={openNewAvatarGenerator}
                            >
                                Generate with AI
                            </Button>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col flex-1 h-full min-h-0 min-w-0">
                    <div class="mb-3">
                        <h3 class="text-lg font-semibold capitalize">Woka</h3>
                        <p class="text-xs text-white/60">
                            Choose an existing avatar or design one front-facing idle frame before expanding it.
                        </p>
                    </div>
                    {#if generatedAssetError}
                        <p class="mb-2 text-sm text-red-300" role="alert">{generatedAssetError}</p>
                    {/if}
                    <div class="rounded-lg flex flex-col flex-1 min-h-0 min-w-0">
                        <div
                            class="flex-none lg:flex-1 flex flex-col items-start gap-0 min-h-0 min-w-0 max-h-full overflow-y-scroll overflow-x-auto scroll-mask py-[20px]"
                        >
                            {#each wokaData?.["woka"]?.collections || [] as collection, collectionIndex}
                                <p class="text-sm text-gray-500 mb-1 mt-4 p-0">{collection.name}</p>
                                <div
                                    id="woka-line-{collectionIndex}"
                                    class="w-full flex flex-row flex-wrap items-start justify-start gap-3"
                                >
                                    {#each collection.textures || [] as texture (texture.id)}
                                        {@const ownedGeneratedAsset = generatedAsset(texture.id)}
                                        <div class="group relative h-fit" id="woka-{texture.id}">
                                            <button
                                                class="rounded border border-solid box-border p-0 h-fit {selectedWokaTextureId?.woka ===
                                                texture.id
                                                    ? 'bg-white/50 border-white'
                                                    : 'bg-white/10 hover:bg-white/20 border-transparent'}"
                                                aria-label={`Select ${texture.name}`}
                                                title={texture.name}
                                                onclick={() => selectTexture(collectionIndex, texture.id)}
                                            >
                                                <WokaImage
                                                    selectedTextures={{ woka: texture.id }}
                                                    {wokaData}
                                                    {getTextureUrl}
                                                    classList="p-2"
                                                    direction={assetsDirection}
                                                />
                                                {#if openingEditorId === texture.id}
                                                    <span
                                                        class="absolute inset-0 flex items-center justify-center rounded bg-black/60 text-xs"
                                                        >Opening…</span
                                                    >
                                                {/if}
                                            </button>
                                            {#if ownedGeneratedAsset}
                                                <div
                                                    class="pointer-events-none absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                                                >
                                                    <button
                                                        class="rounded-full bg-slate-800/90 px-1.5 py-0.5 text-xs text-white hover:bg-slate-700"
                                                        aria-label={`Edit ${ownedGeneratedAsset.name}`}
                                                        title="Edit generated avatar"
                                                        onclick={(event) => {
                                                            event.stopPropagation();
                                                            void openGeneratedWokaEditor(
                                                                ownedGeneratedAsset,
                                                                collectionIndex,
                                                            );
                                                        }}>✎</button
                                                    >
                                                    <button
                                                        class="rounded-full bg-red-700 px-1.5 py-0.5 text-xs text-white hover:bg-red-600"
                                                        aria-label={`Remove ${ownedGeneratedAsset.name}`}
                                                        title="Remove generated avatar"
                                                        onclick={(event) => {
                                                            event.stopPropagation();
                                                            void deleteGeneratedWoka(ownedGeneratedAsset);
                                                        }}>×</button
                                                    >
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
            <div
                class="w-full p-3 flex flex-row items-center gap-2 border-t-2 border-t-white/10"
                style="border-top-style: solid;"
            >
                <button class="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded" onclick={customize}>
                    {$LL.woka.selectWoka.customize()}
                </button>
                <button
                    class="selectCharacterSceneFormSubmit w-full px-4 py-3 bg-secondary text-white rounded hover:bg-secondary-600"
                    onclick={saveSelectedWokaAndContinue}
                >
                    {$LL.woka.selectWoka.continue()}
                </button>
            </div>
        {/if}
    </div>
</div>

{#if showGenerator}
    <AvatarGenerationWizard
        onclose={closeAvatarGenerator}
        initialAvatar={editingWoka ? { name: editingWoka.asset.name, sheet: editingWoka.sheet } : undefined}
        oncomplete={(blob, prompt) => acceptGeneratedWoka(blob, prompt, editingWoka?.asset)}
    />
{/if}

<style>
    .mobile-webkit {
        max-height: -webkit-fill-available !important;
    }
    .scroll-mask {
        mask-image: linear-gradient(to bottom, transparent 0px, black 40px, black calc(100% - 40px), transparent 100%);
        -webkit-mask-image: linear-gradient(
            to bottom,
            transparent 0px,
            black 40px,
            black calc(100% - 40px),
            transparent 100%
        );
    }
</style>
