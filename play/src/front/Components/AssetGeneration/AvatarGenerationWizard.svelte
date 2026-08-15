<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { assetGenerationSession } from "../../Services/AssetGeneration/AssetGenerationSession";
    import {
        archiveAvatarGenerationDraft,
        loadAvatarGenerationDraft,
        saveAvatarGenerationDraft,
        type AvatarGenerationStyle,
    } from "../../Services/AssetGeneration/AvatarGenerationDraftStore";
    import {
        assetGenerationSettings,
        type ReadyAssetGenerationSelection,
    } from "../../Services/AssetGeneration/AssetGenerationSettings";
    import { AssetGenerationError } from "../../Services/AssetGeneration/AssetGenerationError";
    import type {
        AssetGenerationReference,
        AssetGenerationRequest,
    } from "../../Services/AssetGeneration/AssetGenerationTypes";
    import { EphemeralReferenceCollection } from "../../Services/AssetGeneration/ReferenceImageNormalizer";
    import { normalizeGeneratedRaster } from "../../Services/AssetGeneration/RasterOutputNormalizer";
    import { createWokaIdleFrameStage } from "../../Services/AssetGeneration/StagedWokaGeneration";
    import {
        assembleWokaSpriteSheet,
        createDirectionalFrameRequest,
        largestSquareFrameSize,
        loadDefaultWokaPoseReferences,
        mirrorWokaFrameHorizontally,
        neutralAnchorFrameIndex,
        splitWokaSpriteSheet,
        type WokaFrameSize,
        WOKA_DIRECTIONAL_FRAMES,
        WOKA_NEUTRAL_FRAME_INDEXES,
    } from "../../Services/AssetGeneration/WokaDirectionalGeneration";
    import { aiGenerationSettingsVisibilityStore } from "../../Stores/AiGenerationSettingsVisibilityStore";
    import Button from "../UI/Button.svelte";

    type WizardStep = "design" | "generating-design" | "directions" | "review-final" | "saving";

    interface Props {
        onclose: () => void;
        oncomplete: (blob: Blob, prompt: string) => string | void | Promise<string | void>;
        initialAvatar?: { name: string; sheet: Blob };
    }

    let { onclose, oncomplete, initialAvatar }: Props = $props();
    const characterReferences = new EphemeralReferenceCollection({ maximumCount: 1 });
    const customStyleReferences = new EphemeralReferenceCollection({ maximumCount: 1 });
    let step: WizardStep = $state("design");
    let description = $state("");
    let style: AvatarGenerationStyle = $state("cartoon");
    let customStyle = $state("");
    let characterReferencePreview = $state("");
    let customStyleReferencePreview = $state("");
    let designBlob: Blob | null = $state(null);
    let designUrl = $state("");
    let finalBlob: Blob | null = $state(null);
    let directionFrames: Array<Blob | null> = $state(Array.from({ length: 12 }, () => null));
    let directionFrameUrls: string[] = $state(Array.from({ length: 12 }, () => ""));
    let completedFrames = $state(0);
    let failedFrames: number[] = $state([]);
    let regeneratingFrameIndexes: number[] = $state([]);
    let frameInstructions: string[] = $state(Array.from({ length: 12 }, () => ""));
    let error = $state("");
    let checkpointMessage = $state("");
    let controller: AbortController | null = $state(null);
    let checkpointQueue: Promise<void> = Promise.resolve();
    // Put the front-facing row first so the generated core design is the
    // first frame people see, followed by back, left, and right movement.
    const frameDisplayItems = ([1, 0, 2, 10, 9, 11, 4, 3, 5, 7, 6, 8] as const).map((index) => ({
        index,
        frame: WOKA_DIRECTIONAL_FRAMES[index],
    }));

    onMount(() => {
        const initialLoad = initialAvatar ? restoreSavedAvatar(initialAvatar) : restoreDraft();
        initialLoad.catch(() => {
            checkpointMessage = initialAvatar
                ? "This generated avatar could not be opened for editing."
                : "Previous progress could not be restored.";
        });
        assetGenerationSettings
            .initialize()
            .then(() => assetGenerationSettings.restoreExistingHostedConnection())
            .catch(() => undefined);
    });

    onDestroy(() => {
        controller?.abort();
        characterReferences.dispose();
        customStyleReferences.dispose();
        if (designUrl !== "") URL.revokeObjectURL(designUrl);
        revokeDirectionFrameUrls();
    });

    async function addReference(
        file: File | undefined,
        collection: EphemeralReferenceCollection,
        setPreview: (objectUrl: string) => void,
    ) {
        if (file === undefined) return;
        error = "";
        try {
            collection.clear();
            const reference = await collection.add(file, new AbortController().signal);
            setPreview(reference.objectUrl);
        } catch (reason) {
            error = errorMessage(reason, "The reference image could not be added.");
        }
    }

    function dropReference(
        event: DragEvent,
        collection: EphemeralReferenceCollection,
        setPreview: (objectUrl: string) => void,
    ) {
        event.preventDefault();
        addReference(event.dataTransfer?.files[0], collection, setPreview).catch(() => undefined);
    }

    async function generateDesign() {
        const selection = requireSelection();
        if (selection === undefined) return;
        if (description.trim() === "") {
            error = "Describe the avatar you want to create.";
            return;
        }
        error = "";
        step = "generating-design";
        const generationController = new AbortController();
        controller = generationController;
        try {
            const stage = createWokaIdleFrameStage({
                modelId: selection.modelId,
                target: "complete-woka",
                description: `${description.trim()}\n\n${styleInstruction()}`,
                references: [
                    ...characterReferences.forGeneration(),
                    ...(style === "custom" ? customStyleReferences.forGeneration() : []),
                ],
            });
            const generated = await generateWithRetry(stage.request, selection, generationController.signal);
            const preserved = await normalizeGeneratedRaster(generated, undefined, {
                removeOpaqueEdgeBackground: true,
            });
            if (designUrl !== "") URL.revokeObjectURL(designUrl);
            designBlob = preserved;
            designUrl = URL.createObjectURL(preserved);
            directionFrames = Array.from({ length: 12 }, () => null);
            revokeDirectionFrameUrls();
            directionFrameUrls = Array.from({ length: 12 }, () => "");
            setDirectionFrame(1, preserved);
            completedFrames = 1;
            failedFrames = [];
            finalBlob = null;
            await queueCheckpoint();
            step = "directions";
        } catch (reason) {
            if (!generationController.signal.aborted) error = errorMessage(reason, "Avatar design generation failed.");
            step = "design";
        } finally {
            controller = null;
        }
    }

    async function generateDirections() {
        const selection = requireSelection();
        if (selection === undefined || designBlob === null) return;
        error = "";
        step = "directions";
        completedFrames = directionFrames.filter(Boolean).length;
        failedFrames = [];
        const generationController = new AbortController();
        controller = generationController;
        try {
            const poseReferences = await loadDefaultWokaPoseReferences();
            const sourceFrameSize = await makeSourceResolutionConsistent();
            if (directionFrames[1] === null) setDirectionFrame(1, designBlob);
            completedFrames = directionFrames.filter(Boolean).length;
            await queueCheckpoint();

            for (const index of WOKA_NEUTRAL_FRAME_INDEXES) {
                if (directionFrames[index] !== null) continue;
                try {
                    if (index === 7) {
                        const leftIdle = directionFrames[4];
                        if (leftIdle === null) throw new Error("The left idle frame is missing.");
                        // Neutral directions are ordered because the right idle mirrors the completed left idle.
                        // eslint-disable-next-line no-await-in-loop
                        setDirectionFrame(7, await mirrorWokaFrameHorizontally(leftIdle));
                        completedFrames = directionFrames.filter(Boolean).length;
                        // eslint-disable-next-line no-await-in-loop
                        await queueCheckpoint();
                        continue;
                    }
                    // eslint-disable-next-line no-await-in-loop
                    await generateDirectionalFrame(
                        index,
                        designBlob,
                        poseReferences,
                        sourceFrameSize,
                        selection,
                        generationController.signal,
                    );
                } catch {
                    failedFrames = [index];
                    break;
                }
            }
            if (failedFrames.length > 0) {
                error = `${failedFrames.length} frame${failedFrames.length === 1 ? "" : "s"} failed after one automatic retry.`;
                return;
            }

            // First make one distinct contact pose per generated direction.
            // Step B then uses that completed Step A as its primary image
            // source, so the model transforms a real stride instead of
            // inventing a second near-idle pose from the neutral anchor.
            const stepAIndexes = [0, 3, 9].filter((index) => directionFrames[index] === null);
            const stepAOutcomes = await Promise.allSettled(
                stepAIndexes.map(async (index) => {
                    const anchorIndex = neutralAnchorFrameIndex(index);
                    const anchor = anchorIndex === undefined ? undefined : directionFrames[anchorIndex];
                    if (anchor === undefined || anchor === null)
                        throw new Error("The direction's neutral anchor is missing.");
                    await generateDirectionalFrame(
                        index,
                        anchor,
                        poseReferences,
                        sourceFrameSize,
                        selection,
                        generationController.signal,
                    );
                    return index;
                }),
            );
            // This bulk operation owns the only active generation controller and its failure state.
            // eslint-disable-next-line require-atomic-updates
            failedFrames = stepAOutcomes
                .flatMap((outcome, position) => (outcome.status === "rejected" ? [stepAIndexes[position] ?? -1] : []))
                .filter((index) => index >= 0);
            if (failedFrames.length > 0) {
                error = `${failedFrames.length} frame${failedFrames.length === 1 ? "" : "s"} failed after one automatic retry.`;
                return;
            }

            // Every Step B is generated from its own completed Step A. This
            // preserves any handheld object in the same biological hand while
            // still asking the model to reverse only the walking stride.
            const stepBIndexes = [2, 5, 11].filter((index) => directionFrames[index] === null);
            const stepBOutcomes = await Promise.allSettled(
                stepBIndexes.map(async (index) => {
                    const oppositeStepA = directionFrames[index - 2];
                    if (oppositeStepA === null || oppositeStepA === undefined)
                        throw new Error("The direction's Step A source is missing.");
                    await generateDirectionalFrame(
                        index,
                        oppositeStepA,
                        poseReferences,
                        sourceFrameSize,
                        selection,
                        generationController.signal,
                        undefined,
                        true,
                    );
                    return index;
                }),
            );
            // This bulk operation owns the only active generation controller and its failure state.
            // eslint-disable-next-line require-atomic-updates
            failedFrames = stepBOutcomes
                .flatMap((outcome, position) => (outcome.status === "rejected" ? [stepBIndexes[position] ?? -1] : []))
                .filter((index) => index >= 0);
            if (failedFrames.length === 0) {
                const leftStepA = directionFrames[3];
                const leftStepB = directionFrames[5];
                if (leftStepA === null || leftStepB === null) throw new Error("The left walking frames are missing.");
                if (directionFrames[6] === null) setDirectionFrame(6, await mirrorWokaFrameHorizontally(leftStepA));
                if (directionFrames[8] === null) setDirectionFrame(8, await mirrorWokaFrameHorizontally(leftStepB));
                completedFrames = directionFrames.filter(Boolean).length;
                await queueCheckpoint();
            }
            if (failedFrames.length > 0) {
                error = `${failedFrames.length} frame${failedFrames.length === 1 ? "" : "s"} failed after one automatic retry.`;
                return;
            }
            await refreshFinalAvatar(sourceFrameSize);
            await queueCheckpoint();
        } catch (reason) {
            if (!generationController.signal.aborted) error = errorMessage(reason, "Directional generation failed.");
        } finally {
            controller = null;
        }
    }

    async function regenerateFrame(index: number): Promise<void> {
        const selection = requireSelection();
        if (selection === undefined || designBlob === null || WOKA_DIRECTIONAL_FRAMES[index] === undefined) return;
        error = "";
        regeneratingFrameIndexes = [...new Set([...regeneratingFrameIndexes, index])];
        const generationController = new AbortController();
        controller = generationController;
        try {
            const sourceFrameSize = await largestSquareFrameSize([
                designBlob,
                ...directionFrames.filter((frame): frame is Blob => frame !== null),
            ]);
            const anchorIndex = neutralAnchorFrameIndex(index);
            const isStepB = index === 2 || index === 5 || index === 8 || index === 11;
            const completedStepA = isStepB ? directionFrames[index - 2] : null;
            const neutralAnchor = anchorIndex === undefined ? null : directionFrames[anchorIndex];
            const source = completedStepA ?? neutralAnchor ?? designBlob;
            await generateDirectionalFrame(
                index,
                source,
                await loadDefaultWokaPoseReferences(),
                sourceFrameSize,
                selection,
                generationController.signal,
                frameInstructions[index]?.trim(),
                completedStepA !== null,
            );
            failedFrames = failedFrames.filter((failedIndex) => failedIndex !== index);
            await refreshFinalAvatar(sourceFrameSize);
            await queueCheckpoint();
        } catch (reason) {
            if (!generationController.signal.aborted)
                error = errorMessage(reason, "This frame could not be regenerated.");
        } finally {
            regeneratingFrameIndexes = regeneratingFrameIndexes.filter((candidate) => candidate !== index);
            if (controller === generationController) controller = null;
        }
    }

    async function uploadFrame(index: number, file: File | undefined): Promise<void> {
        if (file === undefined || designBlob === null || WOKA_DIRECTIONAL_FRAMES[index] === undefined) return;
        error = "";
        regeneratingFrameIndexes = [...new Set([...regeneratingFrameIndexes, index])];
        try {
            const sourceFrameSize = await largestSquareFrameSize([
                designBlob,
                ...directionFrames.filter((frame): frame is Blob => frame !== null),
                file,
            ]);
            const normalized = await normalizeGeneratedRaster(
                file,
                { ...sourceFrameSize, pixelated: false },
                { removeOpaqueEdgeBackground: true },
            );
            setDirectionFrame(index, normalized);
            completedFrames = directionFrames.filter(Boolean).length;
            failedFrames = failedFrames.filter((failedIndex) => failedIndex !== index);
            await refreshFinalAvatar(sourceFrameSize);
            await queueCheckpoint();
        } catch (reason) {
            error = errorMessage(reason, "This asset could not be added to the frame.");
        } finally {
            regeneratingFrameIndexes = regeneratingFrameIndexes.filter((candidate) => candidate !== index);
        }
    }

    function handleFrameUpload(index: number, input: HTMLInputElement): void {
        const file = input.files?.[0];
        input.value = "";
        uploadFrame(index, file).catch(() => undefined);
    }

    async function refreshFinalAvatar(sourceFrameSize?: WokaFrameSize): Promise<void> {
        if (!directionFrames.every((candidate): candidate is Blob => candidate !== null)) {
            finalBlob = null;
            if (step === "review-final") step = "directions";
            return;
        }
        finalBlob = await assembleWokaSpriteSheet(
            directionFrames,
            sourceFrameSize ?? (await largestSquareFrameSize(directionFrames)),
        );
        if (step !== "saving") step = "review-final";
    }

    async function generateDirectionalFrame(
        index: number,
        anchor: Blob,
        poseReferences: readonly AssetGenerationReference[],
        sourceFrameSize: WokaFrameSize,
        selection: ReadyAssetGenerationSelection,
        signal: AbortSignal,
        adjustment?: string,
        sourceIsOppositeStride = false,
    ): Promise<void> {
        const frame = WOKA_DIRECTIONAL_FRAMES[index];
        const pose = poseReferences[index];
        if (frame === undefined || pose === undefined) throw new Error("The Woka pose guide is incomplete.");
        const request = createDirectionalFrameRequest(
            selection.modelId,
            [description.trim(), adjustment].filter(Boolean).join("\nRequested adjustment: "),
            styleInstruction(),
            {
                id: sourceIsOppositeStride
                    ? `completed-${frame.direction}-step-a`
                    : `approved-${frame.direction}-neutral-anchor`,
                blob: anchor,
                mimeType: "image/png",
            },
            pose,
            sourceFrameSize,
            frame,
            sourceIsOppositeStride,
        );
        const generated = await generateWithRetry(request, selection, signal);
        const consistent = await normalizeGeneratedRaster(
            generated,
            { ...sourceFrameSize, pixelated: false },
            { removeOpaqueEdgeBackground: true },
        );
        setDirectionFrame(index, consistent);
        completedFrames = directionFrames.filter(Boolean).length;
        await queueCheckpoint();
    }

    function setDirectionFrame(index: number, blob: Blob): void {
        const previousUrl = directionFrameUrls[index];
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        const updatedFrames = [...directionFrames];
        updatedFrames[index] = blob;
        directionFrames = updatedFrames;
        const updatedUrls = [...directionFrameUrls];
        updatedUrls[index] = URL.createObjectURL(blob);
        directionFrameUrls = updatedUrls;
    }

    async function confirmAvatar() {
        if (finalBlob === null) return;
        step = "saving";
        error = "";
        try {
            const assetId = await oncomplete(finalBlob, description.trim());
            await archiveAvatarGenerationDraft(assetId ?? crypto.randomUUID());
            onclose();
        } catch (reason) {
            error = errorMessage(reason, "The avatar could not be saved.");
            step = "review-final";
        }
    }

    async function generateWithRetry(
        request: AssetGenerationRequest,
        selection: ReadyAssetGenerationSelection,
        signal: AbortSignal,
    ): Promise<Blob> {
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (signal.aborted) throw new DOMException("Generation cancelled", "AbortError");
            try {
                // Retries must be sequential so a successful first attempt never incurs a second paid call.
                // eslint-disable-next-line no-await-in-loop
                const result = await assetGenerationSession.worker.generate(
                    {
                        approvalId: crypto.randomUUID(),
                        approvedAt: new Date().toISOString(),
                        metadata: {
                            providerId: selection.providerId,
                            modelId: selection.modelId,
                            target: request.target,
                            outputCount: 1,
                            maximumCost: {
                                kind: "unknown",
                                reason: "Provider pricing is unavailable before this generation call.",
                            },
                        },
                        request,
                    },
                    { signal },
                );
                const asset = result.assets[0];
                if (asset === undefined) throw new Error("The provider returned no image.");
                return asset.blob;
            } catch (reason) {
                lastError = reason;
                if (signal.aborted) throw reason;
                if (reason instanceof AssetGenerationError && reason.code === "authentication_failed") {
                    assetGenerationSettings.markCredentialRejected();
                    aiGenerationSettingsVisibilityStore.open();
                    throw reason;
                }
            }
        }
        throw lastError;
    }

    function requireSelection(): ReadyAssetGenerationSelection | undefined {
        const selection = assetGenerationSettings.getReadySelection();
        if (selection !== undefined) return selection;
        error = "Connect an AI provider and choose a model first.";
        aiGenerationSettingsVisibilityStore.open();
        return undefined;
    }

    async function makeSourceResolutionConsistent(): Promise<WokaFrameSize> {
        if (designBlob === null) throw new Error("The approved avatar design is missing.");
        const approvedDesign = designBlob;
        const framesSnapshot = [...directionFrames];
        const existingFrames = framesSnapshot.filter((frame): frame is Blob => frame !== null);
        const sourceFrameSize = await largestSquareFrameSize([approvedDesign, ...existingFrames]);
        const consistentDesign = await normalizeGeneratedRaster(
            approvedDesign,
            { ...sourceFrameSize, pixelated: false },
            { removeOpaqueEdgeBackground: true },
        );
        const consistentFrames = await Promise.all(
            framesSnapshot.map((frame) =>
                frame
                    ? normalizeGeneratedRaster(
                          frame,
                          { ...sourceFrameSize, pixelated: false },
                          { removeOpaqueEdgeBackground: true },
                      )
                    : Promise.resolve(null),
            ),
        );
        // The wizard permits only one active generation controller; these snapshots cannot be replaced concurrently.
        // eslint-disable-next-line require-atomic-updates
        designBlob = consistentDesign;
        if (designUrl !== "") URL.revokeObjectURL(designUrl);
        designUrl = URL.createObjectURL(designBlob);
        // eslint-disable-next-line require-atomic-updates
        directionFrames = consistentFrames;
        revokeDirectionFrameUrls();
        directionFrameUrls = directionFrames.map((frame) => (frame ? URL.createObjectURL(frame) : ""));
        completedFrames = directionFrames.filter(Boolean).length;
        await queueCheckpoint();
        return sourceFrameSize;
    }

    async function restoreDraft(): Promise<void> {
        const draft = await loadAvatarGenerationDraft();
        if (draft === null) {
            if (designBlob !== null) await queueCheckpoint();
            return;
        }
        description = draft.description;
        style = draft.style;
        customStyle = draft.customStyle;
        designBlob = draft.designBlob;
        designUrl = URL.createObjectURL(draft.designBlob);
        directionFrames = draft.directionFrames;
        revokeDirectionFrameUrls();
        directionFrameUrls = directionFrames.map((frame) => (frame ? URL.createObjectURL(frame) : ""));
        completedFrames = directionFrames.filter(Boolean).length;
        finalBlob = draft.finalBlob;
        if (directionFrames[1] === null) {
            setDirectionFrame(1, designBlob);
            completedFrames = directionFrames.filter(Boolean).length;
        }
        if (draft.finalBlob !== null) {
            if (completedFrames === WOKA_DIRECTIONAL_FRAMES.length) {
                const sourceFrameSize = await makeSourceResolutionConsistent();
                const completed = directionFrames.filter((frame): frame is Blob => frame !== null);
                finalBlob = await assembleWokaSpriteSheet(completed, sourceFrameSize);
            }
            step = "review-final";
        } else {
            step = "directions";
        }
        checkpointMessage =
            completedFrames > 0
                ? `Restored your avatar and ${completedFrames} completed finalization step${completedFrames === 1 ? "" : "s"}.`
                : "Restored your previously approved avatar design.";
        await queueCheckpoint();
    }

    async function restoreSavedAvatar(avatar: { name: string; sheet: Blob }): Promise<void> {
        const frames = await splitWokaSpriteSheet(avatar.sheet);
        description = avatar.name.replace(/^Avatar:\s*/i, "");
        style = "custom";
        customStyle = "Preserve the existing avatar's visual style exactly.";
        designBlob = frames[1] ?? frames[0] ?? null;
        if (designBlob === null) throw new Error("The saved avatar has no front-facing frame.");
        designUrl = URL.createObjectURL(designBlob);
        directionFrames = frames;
        directionFrameUrls = frames.map((frame) => URL.createObjectURL(frame));
        completedFrames = frames.length;
        finalBlob = await assembleWokaSpriteSheet(frames, await largestSquareFrameSize(frames));
        checkpointMessage = "";
        step = "review-final";
    }

    function revokeDirectionFrameUrls(): void {
        for (const objectUrl of directionFrameUrls) {
            if (objectUrl !== "") URL.revokeObjectURL(objectUrl);
        }
    }

    function queueCheckpoint(): Promise<void> {
        if (designBlob === null) return Promise.resolve();
        const snapshot = {
            description: description.trim(),
            style,
            customStyle: customStyle.trim(),
            designBlob,
            directionFrames: [...directionFrames],
            finalBlob,
        };
        checkpointQueue = checkpointQueue
            .then(() => saveAvatarGenerationDraft(snapshot))
            .then(() => {
                checkpointMessage = "Progress saved in this browser.";
            })
            .catch(() => {
                checkpointMessage = "Progress could not be saved in this browser.";
            });
        return checkpointQueue;
    }

    function styleInstruction(): string {
        if (style === "voxel") return "Style guide: polished voxel-art character with readable block forms.";
        if (style === "ghibli")
            return "Style guide: warm hand-painted fantasy animation, soft shapes and expressive details.";
        if (style === "cartoon") return "Style guide: clean colorful cartoon game character with a strong silhouette.";
        return `Custom style guide: ${customStyle.trim() || "follow the supplied custom-style reference image"}.`;
    }

    function closeWizard() {
        controller?.abort();
        onclose();
    }

    function errorMessage(reason: unknown, fallback: string): string {
        return reason instanceof Error ? reason.message : fallback;
    }
</script>

<div
    class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="AI avatar generator"
>
    <section
        class="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#17263d] text-white shadow-2xl"
    >
        <header class="flex items-start justify-between gap-4 border-b border-white/10 p-5">
            <div>
                <p class="text-xs uppercase tracking-widest text-white/55">AI avatar wizard</p>
                <h2 class="text-2xl font-semibold">Create your Woka</h2>
            </div>
            <div class="flex items-center gap-2">
                {#if step === "review-final" || step === "saving"}
                    <Button variant="success" onclick={confirmAvatar} disabled={step === "saving"}>
                        {step === "saving" ? "Saving…" : "Save avatar"}
                    </Button>
                {/if}
                <button class="rounded px-3 py-2 text-sm hover:bg-white/10" onclick={closeWizard}>Close</button>
            </div>
        </header>

        <div class="grid grid-cols-3 border-b border-white/10 text-center text-xs">
            <div
                class={`p-3 ${step === "design" || step === "generating-design" ? "bg-secondary/25 text-white" : "text-white/50"}`}
            >
                1. Design avatar
            </div>
            <div class={`p-3 ${step === "directions" ? "bg-secondary/25 text-white" : "text-white/50"}`}>
                2. Generate directions
            </div>
            <div
                class={`p-3 ${step === "review-final" || step === "saving" ? "bg-secondary/25 text-white" : "text-white/50"}`}
            >
                3. Confirm
            </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-5">
            {#if error}<p
                    class="mb-4 rounded-lg border border-red-300/30 bg-red-950/40 p-3 text-sm text-red-200"
                    role="alert"
                >
                    {error}
                </p>{/if}
            {#if checkpointMessage !== ""}
                <p class="mb-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/65">
                    {checkpointMessage}
                </p>
            {/if}

            {#if step === "design"}
                <label class="block text-sm font-semibold">
                    Describe your character
                    <textarea
                        bind:value={description}
                        rows="4"
                        class="mt-2 w-full resize-y rounded-lg bg-black/30 p-3 font-normal"
                        placeholder="A fox botanist in a yellow raincoat with round glasses…"
                    ></textarea>
                </label>

                <div class="mt-4">
                    <p class="text-sm font-semibold">
                        Character reference image <span class="font-normal text-white/50">(optional)</span>
                    </p>
                    <label
                        class="mt-2 flex min-h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-black/20 p-4 text-center hover:border-white/40"
                        ondragover={(event) => event.preventDefault()}
                        ondrop={(event) =>
                            dropReference(event, characterReferences, (objectUrl) => {
                                characterReferencePreview = objectUrl;
                            })}
                    >
                        {#if characterReferencePreview !== ""}
                            <img
                                src={characterReferencePreview}
                                alt="Character reference"
                                class="h-28 w-28 rounded-lg object-contain"
                            />
                        {:else}
                            <span class="text-sm text-white/65">Drop a character image here or click to upload</span>
                        {/if}
                        <input
                            class="sr-only"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onchange={(event) =>
                                addReference(event.currentTarget.files?.[0], characterReferences, (objectUrl) => {
                                    characterReferencePreview = objectUrl;
                                })}
                        />
                    </label>
                    <p class="mt-2 text-xs text-white/50">
                        Use this to guide the character's identity, clothing, or features. It is kept only for this
                        generation.
                    </p>
                </div>

                <fieldset class="mt-5">
                    <legend class="text-sm font-semibold">Style guide</legend>
                    <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {#each ["voxel", "ghibli", "cartoon", "custom"] as option (option)}
                            <button
                                class={`rounded-lg border p-3 capitalize ${style === option ? "border-secondary bg-secondary/25" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
                                onclick={() => (style = option as AvatarGenerationStyle)}>{option}</button
                            >
                        {/each}
                    </div>
                    {#if style === "custom"}
                        <div class="mt-3 rounded-xl border border-white/15 bg-black/15 p-4">
                            <label class="block text-sm font-semibold">
                                Describe your custom visual style
                                <textarea
                                    bind:value={customStyle}
                                    rows="4"
                                    class="mt-2 w-full resize-y rounded-lg bg-black/30 p-3 font-normal"
                                    placeholder="Describe the rendering, shapes, colors, linework, texture, and level of detail…"
                                ></textarea>
                            </label>

                            <div class="mt-4">
                                <p class="text-sm font-semibold">
                                    Custom style reference image
                                    <span class="font-normal text-white/50">(optional)</span>
                                </p>
                                <label
                                    class="mt-2 flex min-h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-black/20 p-4 text-center hover:border-white/40"
                                    ondragover={(event) => event.preventDefault()}
                                    ondrop={(event) =>
                                        dropReference(event, customStyleReferences, (objectUrl) => {
                                            customStyleReferencePreview = objectUrl;
                                        })}
                                >
                                    {#if customStyleReferencePreview !== ""}
                                        <img
                                            src={customStyleReferencePreview}
                                            alt="Custom visual style reference"
                                            class="h-28 w-28 rounded-lg object-contain"
                                        />
                                    {:else}
                                        <span class="text-sm text-white/65"
                                            >Drop a style reference here or click to upload</span
                                        >
                                    {/if}
                                    <input
                                        class="sr-only"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        onchange={(event) =>
                                            addReference(
                                                event.currentTarget.files?.[0],
                                                customStyleReferences,
                                                (objectUrl) => {
                                                    customStyleReferencePreview = objectUrl;
                                                },
                                            )}
                                    />
                                </label>
                                <p class="mt-2 text-xs text-white/50">
                                    This image guides visual treatment only; the character reference above guides who
                                    the avatar is.
                                </p>
                            </div>
                        </div>
                    {/if}
                </fieldset>

                <div class="mt-6 flex justify-end">
                    <Button variant="primary" onclick={generateDesign} disabled={description.trim() === ""}
                        >Generate design</Button
                    >
                </div>
            {:else if step === "generating-design"}
                <div class="flex flex-col items-center py-8">
                    <div
                        class="flex h-[240px] w-[240px] animate-pulse items-center justify-center rounded-xl border border-white/15 bg-white/10 text-sm text-white/55"
                    >
                        Generating your avatar…
                    </div>
                    <p class="mt-4 text-sm text-white/65">Creating one detailed front-facing design</p>
                </div>
            {:else if step === "directions" || step === "review-final" || step === "saving"}
                <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 class="text-xl font-semibold">Build your movement set</h3>
                        <p class="mt-1 text-sm text-white/60">
                            {completedFrames} of {WOKA_DIRECTIONAL_FRAMES.length} frames ready. Generate the rest with AI,
                            or customize any frame yourself.
                        </p>
                    </div>
                    <div class="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                        <Button
                            appearance="border"
                            disabled={controller !== null || step === "saving"}
                            onclick={() => (step = "design")}>Edit core design</Button
                        >
                        <Button
                            variant="primary"
                            disabled={controller !== null ||
                                step === "saving" ||
                                completedFrames === WOKA_DIRECTIONAL_FRAMES.length}
                            onclick={generateDirections}
                        >
                            {controller !== null ? "Generating…" : "Generate all"}
                        </Button>
                    </div>
                </div>

                <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {#each frameDisplayItems as item (item.index)}
                        <article
                            class={`overflow-hidden rounded-xl border p-3 ${directionFrames[item.index] ? "border-white/15 bg-black/15" : failedFrames.includes(item.index) ? "border-red-300/35 bg-red-950/20" : "border-dashed border-white/20 bg-black/10"}`}
                        >
                            <div class="flex h-44 items-center justify-center rounded-lg bg-black/25 p-3 sm:h-48">
                                {#if directionFrameUrls[item.index]}
                                    <img
                                        src={directionFrameUrls[item.index]}
                                        alt={`${item.frame.direction} ${item.frame.motion}`}
                                        class="h-full w-full object-contain"
                                    />
                                {:else}
                                    <div class="text-center text-white/45">
                                        <span class="text-2xl">{failedFrames.includes(item.index) ? "!" : "+"}</span>
                                        <p class="mt-2 text-xs">
                                            {failedFrames.includes(item.index) ? "Generation failed" : "No asset yet"}
                                        </p>
                                    </div>
                                {/if}
                            </div>
                            <div class="mt-3 flex items-center justify-between gap-3">
                                <p class="text-sm font-semibold capitalize">
                                    {item.frame.direction} · {item.frame.motion.replace("walking ", "")}
                                </p>
                                {#if item.index === 1}
                                    <span
                                        class="rounded-full bg-secondary/25 px-2 py-1 text-[10px] uppercase tracking-wide text-white/75"
                                        >Core design</span
                                    >
                                {/if}
                            </div>
                            <textarea
                                bind:value={frameInstructions[item.index]}
                                rows="2"
                                class="mt-3 w-full resize-y rounded-md bg-black/30 p-2 text-xs"
                                placeholder="Optional changes for this frame…"
                            ></textarea>
                            <div class="mt-2 grid grid-cols-2 gap-2">
                                <Button
                                    size="sm"
                                    appearance="border"
                                    class="w-full"
                                    disabled={controller !== null ||
                                        step === "saving" ||
                                        regeneratingFrameIndexes.includes(item.index)}
                                    onclick={() => regenerateFrame(item.index)}
                                >
                                    {regeneratingFrameIndexes.includes(item.index)
                                        ? "Working…"
                                        : directionFrames[item.index]
                                          ? "Regenerate with AI"
                                          : "Generate with AI"}
                                </Button>
                                <label
                                    class={`btn btn-border btn-sm flex w-full items-center justify-center text-center ${controller !== null || step === "saving" || regeneratingFrameIndexes.includes(item.index) ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                                >
                                    <span class="btn-label">
                                        {directionFrames[item.index] ? "Replace asset" : "Upload asset"}
                                    </span>
                                    <input
                                        class="sr-only"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        disabled={controller !== null ||
                                            step === "saving" ||
                                            regeneratingFrameIndexes.includes(item.index)}
                                        onchange={(event) => handleFrameUpload(item.index, event.currentTarget)}
                                    />
                                </label>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
        </div>
    </section>
</div>
