<script lang="ts">
    import { onMount } from "svelte";
    import type {
        TeapotMapOperation,
        TeapotMcpSessionCredential,
        TeapotPaidGenerationCompletionResult,
    } from "@workadventure/teapot-mcp/contracts";

    import type { AssetGenerationTarget } from "../../Services/AssetGeneration/AssetGenerationTypes";
    import { teapotMcpAssetPersistence } from "../../Services/TeapotMcpAssetPersistence";
    import { teapotMcpBrowserApi, type TeapotMcpBrowserProposal } from "../../Services/TeapotMcpBrowserApi";
    import AssetGenerationPanel from "../AssetGeneration/AssetGenerationPanel.svelte";

    let open = $state(false);
    let loading = $state(false);
    let clientName = $state("Codex");
    let proposals = $state<TeapotMcpBrowserProposal[]>([]);
    let credential = $state<TeapotMcpSessionCredential>();
    let error = $state<string>();
    let copied = $state(false);
    let activeProposalId = $state<string>();
    let persistedPaidResults = $state<Record<string, TeapotPaidGenerationCompletionResult>>({});

    const pendingCount = $derived(proposals.filter((proposal) => proposal.state === "pending").length);

    onMount(() => {
        const controller = new AbortController();
        refresh(controller.signal).catch(() => undefined);
        const interval = window.setInterval(() => {
            refresh(controller.signal).catch(() => undefined);
        }, 5_000);
        return () => {
            controller.abort();
            window.clearInterval(interval);
        };
    });

    async function refresh(signal?: AbortSignal): Promise<void> {
        try {
            const currentById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
            const listed = await teapotMcpBrowserApi.listProposals(undefined, signal);
            // eslint-disable-next-line require-atomic-updates -- each refresh replaces the complete proposal snapshot
            proposals = await Promise.all(
                listed.map(async (proposal) => {
                    const current = currentById.get(proposal.id);
                    if (current?.approvalToken !== undefined) {
                        return { ...proposal, approvalToken: current.approvalToken };
                    }
                    if (proposal.state !== "approved" || proposal.payload.kind !== "paid-asset-generation") {
                        return proposal;
                    }
                    return teapotMcpBrowserApi.getProposal(proposal.id, signal).catch(() => proposal);
                }),
            );
        } catch (refreshError: unknown) {
            if (refreshError instanceof DOMException && refreshError.name === "AbortError") return;
        }
    }

    async function connectAgent(): Promise<void> {
        loading = true;
        error = undefined;
        credential = undefined;
        try {
            credential = await teapotMcpBrowserApi.createSession(clientName.trim());
        } catch (connectError: unknown) {
            error = readableError(connectError);
        } finally {
            loading = false;
        }
    }

    async function copyConnection(): Promise<void> {
        if (credential === undefined) return;
        await navigator.clipboard.writeText(
            JSON.stringify(
                {
                    url: credential.mcpEndpoint,
                    headers: { Authorization: `Bearer ${credential.bearerToken}` },
                },
                null,
                2,
            ),
        );
        copied = true;
        window.setTimeout(() => (copied = false), 2_000);
    }

    async function revokeCredential(): Promise<void> {
        if (credential === undefined) return;
        loading = true;
        error = undefined;
        try {
            await teapotMcpBrowserApi.revokeSession(credential.sessionId);
            // eslint-disable-next-line require-atomic-updates -- revocation is serialized by the loading state
            credential = undefined;
        } catch (revokeError: unknown) {
            error = readableError(revokeError);
        } finally {
            loading = false;
        }
    }

    async function decide(proposal: TeapotMcpBrowserProposal, decision: "approve" | "deny"): Promise<void> {
        activeProposalId = proposal.id;
        error = undefined;
        try {
            const updated =
                decision === "approve"
                    ? await teapotMcpBrowserApi.approve(proposal.id)
                    : await teapotMcpBrowserApi.deny(proposal.id);
            proposals = proposals.map((candidate) => (candidate.id === updated.id ? updated : candidate));
        } catch (decisionError: unknown) {
            error = readableError(decisionError);
            await refresh();
        } finally {
            activeProposalId = undefined;
        }
    }

    async function authorizePaidGeneration(proposal: TeapotMcpBrowserProposal): Promise<string> {
        const approvalToken = requireApprovalToken(proposal);
        const claim = await teapotMcpBrowserApi.claimPaidGeneration(proposal.id, approvalToken);
        return claim.approvalId;
    }

    async function acceptPaidCandidate(
        proposal: TeapotMcpBrowserProposal,
        asset: { blob: Blob; providerId: string; modelId: string },
    ): Promise<void> {
        if (proposal.payload.kind !== "paid-asset-generation") {
            throw new Error("This proposal is not an asset generation request");
        }
        const existing = persistedPaidResults[proposal.id];
        const persisted =
            existing?.status === "accepted-asset"
                ? existing
                : await teapotMcpAssetPersistence.persist(proposal.payload.request, {
                      ...asset,
                      providerId: requirePaidProvider(asset.providerId),
                  });
        persistedPaidResults = { ...persistedPaidResults, [proposal.id]: persisted };
        await completePaidGeneration(proposal, persisted);
        const remaining = { ...persistedPaidResults };
        delete remaining[proposal.id];
        persistedPaidResults = remaining;
    }

    async function failPaidGeneration(
        proposal: TeapotMcpBrowserProposal,
        reason: "provider-error" | "cancelled" | "candidate-discarded",
    ): Promise<void> {
        await completePaidGeneration(proposal, { status: "generation-failed", reason });
    }

    async function completePaidGeneration(
        proposal: TeapotMcpBrowserProposal,
        result: TeapotPaidGenerationCompletionResult,
    ): Promise<void> {
        const updated = await teapotMcpBrowserApi.completePaidGeneration(
            proposal.id,
            requireApprovalToken(proposal),
            result,
        );
        proposals = proposals.map((candidate) => (candidate.id === updated.id ? updated : candidate));
    }

    function requireApprovalToken(proposal: TeapotMcpBrowserProposal): string {
        if (proposal.approvalToken === undefined) {
            throw new Error("This approval expired or is no longer available; refresh the proposal");
        }
        return proposal.approvalToken;
    }

    function generationTarget(proposal: TeapotMcpBrowserProposal): AssetGenerationTarget {
        if (proposal.payload.kind !== "paid-asset-generation") return "environment-object";
        switch (proposal.payload.request.purpose) {
            case "avatar":
                return "complete-woka";
            case "avatar-part":
                return wokaPartTarget(proposal.payload.request.targetAssetClass);
            case "tileset":
                return "tileset";
            case "map-entity":
            case "reference":
                return "environment-object";
            default: {
                const exhaustive: never = proposal.payload.request.purpose;
                throw new Error(`Unsupported generation purpose: ${String(exhaustive)}`);
            }
        }
    }

    function wokaPartTarget(assetClass: string): AssetGenerationTarget {
        const normalized = assetClass.trim().toLowerCase();
        if (normalized.includes("body")) return "woka-body";
        if (normalized.includes("eye")) return "woka-eyes";
        if (normalized.includes("hair")) return "woka-hair";
        if (normalized.includes("clothes") || normalized.includes("clothing")) return "woka-clothes";
        if (normalized.includes("hat")) return "woka-hat";
        return "woka-accessory";
    }

    function requirePaidProvider(value: string): "openrouter" | "codex-cli" | "claude-cli" {
        if (value === "openrouter" || value === "codex-cli" || value === "claude-cli") return value;
        throw new Error("This provider cannot complete an MCP generation proposal");
    }

    function proposalDetails(proposal: TeapotMcpBrowserProposal): string[] {
        switch (proposal.payload.kind) {
            case "map-patch":
                return [
                    `Map revision ${proposal.payload.patch.expectedRevision}`,
                    ...proposal.payload.patch.operations.map((operation) => describeOperation(operation)),
                ];
            case "paid-asset-generation":
                return [
                    `${proposal.payload.request.output.width}×${proposal.payload.request.output.height} ${proposal.payload.request.output.frameLayout}`,
                    proposal.payload.request.prompt,
                ];
            case "undo-map-publication":
                return [
                    `Restore revision snapshot at map revision ${proposal.payload.expectedRevision}`,
                    proposal.payload.rationale,
                ];
        }
    }

    function describeOperation(operation: TeapotMapOperation): string {
        switch (operation.kind) {
            case "import-tileset":
                return `Import saved tileset ${operation.name} (${operation.assetId}); GIDs are allocated in the isolated draft`;
            case "paint-region":
                return `Paint ${operation.layer} at ${operation.x},${operation.y} · ${operation.width}×${operation.height} tiles`;
            case "place-tile-object":
                return `Place ${operation.name} (GID ${operation.gid}) on ${operation.layer} at ${operation.x},${operation.y}`;
            case "place-zone":
                return `Place zone ${operation.name} on ${operation.layer} at ${operation.x},${operation.y}`;
            case "update-object":
                return `Update object ${operation.objectId} on ${operation.layer}`;
            case "remove-object":
                return `Remove object ${operation.objectId} from ${operation.layer}`;
            case "define-tile-animation":
                return `Animate ${operation.tileset} tile ${operation.tileId} with ${operation.frames.length} frames`;
            default: {
                const exhaustive: never = operation;
                throw new Error(`Unsupported proposal operation: ${String(exhaustive)}`);
            }
        }
    }

    function readableError(value: unknown): string {
        return value instanceof Error ? value.message : "The request could not be completed";
    }
</script>

<button
    class="fixed bottom-4 left-4 z-[1200] rounded-full border border-white/20 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
    type="button"
    aria-label={`AI authoring proposals${pendingCount > 0 ? `, ${pendingCount} pending` : ""}`}
    aria-expanded={open}
    onclick={() => (open = !open)}
>
    AI authoring
    {#if pendingCount > 0}
        <span class="ml-2 rounded-full bg-amber-300 px-2 py-0.5 text-xs text-slate-950">{pendingCount}</span>
    {/if}
</button>

{#if open}
    <aside
        class="fixed bottom-20 left-4 z-[1200] flex max-h-[min(76dvh,720px)] w-[min(94vw,440px)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/98 text-white shadow-2xl"
        aria-label="AI authoring proposal inbox"
    >
        <header class="flex items-start justify-between border-b border-white/10 px-5 py-4">
            <div>
                <h2 class="text-lg font-bold">AI authoring</h2>
                <p class="mt-1 text-xs text-slate-300">Agent changes wait here until you approve them.</p>
            </div>
            <button
                class="rounded p-2 hover:bg-white/10"
                type="button"
                aria-label="Close AI authoring"
                onclick={() => (open = false)}>✕</button
            >
        </header>

        <div class="overflow-y-auto px-5 py-4">
            <section aria-labelledby="agent-connection-heading">
                <h3 id="agent-connection-heading" class="text-sm font-semibold">Connect an agent</h3>
                <div class="mt-2 flex gap-2">
                    <label class="sr-only" for="teapot-mcp-client-name">Agent name</label>
                    <input
                        id="teapot-mcp-client-name"
                        class="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
                        bind:value={clientName}
                        maxlength="120"
                        placeholder="Codex"
                    />
                    <button
                        class="rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                        type="button"
                        disabled={loading || clientName.trim().length === 0}
                        onclick={connectAgent}>{loading ? "Creating…" : "Create"}</button
                    >
                </div>
                {#if credential}
                    <div class="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-xs">
                        <p class="font-semibold text-amber-200">
                            Copy this now. The bearer token is shown only in this tab.
                        </p>
                        <p class="mt-1 break-all text-slate-300">{credential.mcpEndpoint}</p>
                        <div class="mt-2 flex gap-2">
                            <button
                                class="rounded bg-white/10 px-3 py-2 hover:bg-white/20"
                                type="button"
                                onclick={copyConnection}
                            >
                                {copied ? "Copied" : "Copy MCP configuration"}
                            </button>
                            <button
                                class="rounded px-3 py-2 text-red-200 hover:bg-red-400/10"
                                type="button"
                                onclick={revokeCredential}
                            >
                                Revoke
                            </button>
                        </div>
                    </div>
                {/if}
            </section>

            <section class="mt-6" aria-labelledby="proposal-inbox-heading">
                <div class="flex items-center justify-between">
                    <h3 id="proposal-inbox-heading" class="text-sm font-semibold">Proposals</h3>
                    <button
                        class="rounded px-2 py-1 text-xs text-cyan-200 hover:bg-white/10"
                        type="button"
                        onclick={() => refresh()}>Refresh</button
                    >
                </div>

                {#if proposals.length === 0}
                    <p class="mt-3 rounded-lg bg-white/5 p-3 text-sm text-slate-300">No agent proposals yet.</p>
                {:else}
                    <ul class="mt-3 space-y-3">
                        {#each proposals as proposal (proposal.id)}
                            <li class="rounded-xl border border-white/10 bg-white/5 p-4">
                                <div class="flex items-start justify-between gap-3">
                                    <div>
                                        <p class="font-semibold">{proposal.title}</p>
                                        <p class="mt-1 text-xs text-slate-400">
                                            {proposal.clientName} · {proposal.toolName}
                                        </p>
                                    </div>
                                    <span
                                        class={`rounded-full px-2 py-1 text-[11px] font-semibold ${proposal.state === "pending" ? "bg-amber-300 text-slate-950" : "bg-white/10 text-slate-200"}`}
                                    >
                                        {proposal.state}
                                    </span>
                                </div>
                                <p class="mt-3 text-sm text-slate-200">{proposal.summary}</p>
                                <ul class="mt-2 list-inside list-disc text-xs text-slate-400">
                                    {#each proposalDetails(proposal) as detail (detail)}
                                        <li class="break-words">{detail}</li>
                                    {/each}
                                </ul>
                                {#if proposal.estimatedCostUsd !== null}
                                    <p class="mt-2 text-xs text-amber-200">
                                        Maximum stated cost: ${proposal.estimatedCostUsd.toFixed(2)}
                                    </p>
                                {/if}
                                {#if proposal.terminalMessage}
                                    <p class="mt-2 text-xs text-slate-300" aria-live="polite">
                                        {proposal.terminalMessage}
                                    </p>
                                {/if}
                                {#if proposal.state === "approved" && proposal.payload.kind === "paid-asset-generation"}
                                    {#if proposal.approvalToken !== undefined}
                                        <div class="mt-4">
                                            <AssetGenerationPanel
                                                target={generationTarget(proposal)}
                                                title={`Generate ${proposal.payload.request.targetAssetClass}`}
                                                promptGuidance="This is the exact agent proposal you approved. Your provider credential stays in the browser worker, and the approval permits one provider call."
                                                initialPrompt={proposal.payload.request.prompt}
                                                promptReadOnly
                                                requiredReferenceCount={proposal.payload.request.referenceCount}
                                                maximumCostUsd={proposal.payload.request.estimatedMaximumCostUsd}
                                                outputSize={{
                                                    width: proposal.payload.request.output.width,
                                                    height: proposal.payload.request.output.height,
                                                    pixelated: true,
                                                }}
                                                authorizeGeneration={() => authorizePaidGeneration(proposal)}
                                                onGenerationFailure={(reason) => failPaidGeneration(proposal, reason)}
                                                onDiscardCandidate={() =>
                                                    failPaidGeneration(proposal, "candidate-discarded")}
                                                onAccept={(asset) => acceptPaidCandidate(proposal, asset)}
                                            />
                                            <p class="mt-2 text-xs text-slate-400">
                                                Accepting first saves this asset to your private authoring catalog.
                                                Using it on an avatar or map remains a separate approval.
                                            </p>
                                        </div>
                                    {:else}
                                        <p class="mt-3 rounded-lg bg-amber-300/10 p-3 text-xs text-amber-100">
                                            This generation approval is unavailable or already claimed. Refresh to see
                                            its terminal state.
                                        </p>
                                    {/if}
                                {/if}
                                {#if proposal.state === "pending"}
                                    <div class="mt-4 flex gap-2">
                                        <button
                                            class="flex-1 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                                            type="button"
                                            disabled={activeProposalId === proposal.id}
                                            onclick={() => decide(proposal, "approve")}>Approve</button
                                        >
                                        <button
                                            class="flex-1 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                                            type="button"
                                            disabled={activeProposalId === proposal.id}
                                            onclick={() => decide(proposal, "deny")}>Deny</button
                                        >
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>

            {#if error}
                <p class="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            {/if}
        </div>
    </aside>
{/if}
