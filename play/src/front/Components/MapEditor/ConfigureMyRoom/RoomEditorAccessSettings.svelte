<script lang="ts">
    import { onMount } from "svelte";

    import { LL } from "../../../../i18n/i18n-svelte";
    import {
        RoomAccessConflictError,
        roomAccessApi,
        type RoomAccessMemberInput,
        type RoomAccessMode,
        type RoomAccessPolicy,
        type RoomAccessResponse,
        type RoomAccessRole,
        type RoomVisitor,
    } from "../../../Services/RoomEditorAccessApi";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import Button from "../../UI/Button.svelte";

    const roles: RoomAccessRole[] = ["view", "edit", "admin"];
    const modes: RoomAccessMode[] = ["everyone", "specific", "nobody"];

    function emptyPolicy(role: RoomAccessRole): RoomAccessPolicy {
        return { role, configured: false, mode: role === "view" ? "everyone" : "specific", version: 0, members: [] };
    }

    let policies = $state<Record<RoomAccessRole, RoomAccessPolicy>>({
        view: emptyPolicy("view"),
        edit: emptyPolicy("edit"),
        admin: emptyPolicy("admin"),
    });
    let visitors = $state<RoomVisitor[]>([]);
    let savedFingerprints = $state<Record<RoomAccessRole, string>>({ view: "", edit: "", admin: "" });
    let identifier = $state("");
    let displayName = $state("");
    let newMemberRole = $state<RoomAccessRole>("view");
    let visitorSearch = $state("");
    let isLoading = $state(true);
    let isSaving = $state(false);
    let loadError = $state(false);
    let saveError = $state(false);
    let conflict = $state(false);
    let addError = $state<"required" | "duplicate" | undefined>();
    let saved = $state(false);
    let requestController: AbortController | undefined;

    function policyFingerprint(policy: RoomAccessPolicy): string {
        return JSON.stringify({
            mode: policy.mode,
            members: policy.members
                .map((member) => ({ identifier: member.identifier, displayName: member.displayName }))
                .sort((left, right) => left.identifier.localeCompare(right.identifier)),
        });
    }

    let changedRoles = $derived(roles.filter((role) => policyFingerprint(policies[role]) !== savedFingerprints[role]));
    let canSave = $derived(!isLoading && !isSaving && !conflict && changedRoles.length > 0);
    let filteredVisitors = $derived.by(() => {
        const query = visitorSearch.trim().toLocaleLowerCase();
        if (!query) return visitors;
        return visitors.filter(
            (visitor) =>
                visitor.displayName.toLocaleLowerCase().includes(query) ||
                visitor.identifier.toLocaleLowerCase().includes(query),
        );
    });

    function applyResponse(response: RoomAccessResponse): void {
        const nextPolicies = { ...policies };
        const nextFingerprints = { ...savedFingerprints };
        for (const policy of response.policies) {
            nextPolicies[policy.role] = policy;
            nextFingerprints[policy.role] = policyFingerprint(policy);
        }
        policies = nextPolicies;
        savedFingerprints = nextFingerprints;
        visitors = response.visitors;
    }

    onMount(() => {
        requestController = new AbortController();
        load(requestController.signal).catch((error: unknown) =>
            console.error("Could not initialize room access", error),
        );
        return () => requestController?.abort();
    });

    async function load(signal = requestController?.signal): Promise<void> {
        isLoading = true;
        loadError = false;
        saveError = false;
        conflict = false;
        saved = false;
        try {
            applyResponse(await roomAccessApi.get(gameManager.currentStartedRoom.href, signal));
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            console.error("Could not load room access", error);
            loadError = true;
        } finally {
            isLoading = false;
        }
    }

    function updatePolicy(role: RoomAccessRole, update: Partial<RoomAccessPolicy>): void {
        policies = { ...policies, [role]: { ...policies[role], ...update } };
        saveError = false;
        conflict = false;
        saved = false;
    }

    function hasMember(role: RoomAccessRole, memberIdentifier: string): boolean {
        return policies[role].members.some((member) => member.identifier === memberIdentifier);
    }

    function addMember(role: RoomAccessRole, member: RoomAccessMemberInput): boolean {
        const normalizedIdentifier = member.identifier.trim();
        if (!normalizedIdentifier || hasMember(role, normalizedIdentifier)) return false;
        updatePolicy(role, {
            members: [
                ...policies[role].members,
                {
                    userId: "",
                    identifier: normalizedIdentifier,
                    displayName: member.displayName?.trim() || normalizedIdentifier,
                },
            ],
        });
        return true;
    }

    function addTypedMember(): void {
        const normalizedIdentifier = identifier.trim();
        if (!normalizedIdentifier) {
            addError = "required";
            return;
        }
        if (!addMember(newMemberRole, { identifier: normalizedIdentifier, displayName })) {
            addError = "duplicate";
            return;
        }
        identifier = "";
        displayName = "";
        addError = undefined;
    }

    function removeMember(role: RoomAccessRole, memberIdentifier: string): void {
        updatePolicy(role, {
            members: policies[role].members.filter((member) => member.identifier !== memberIdentifier),
        });
    }

    function toggleVisitorRole(visitor: RoomVisitor, role: RoomAccessRole): void {
        if (hasMember(role, visitor.identifier)) removeMember(role, visitor.identifier);
        else addMember(role, { identifier: visitor.identifier, displayName: visitor.displayName });
    }

    async function save(): Promise<void> {
        if (!canSave) return;
        isSaving = true;
        saveError = false;
        conflict = false;
        saved = false;
        const pending = changedRoles.map((role) => ({ role, policy: policies[role] }));
        try {
            const updates = await Promise.all(
                pending.map(({ role, policy }) =>
                    roomAccessApi.update(
                        {
                            roomId: gameManager.currentStartedRoom.href,
                            role,
                            mode: policy.mode,
                            expectedVersion: policy.version,
                            members: policy.members.map((member) => ({
                                identifier: member.identifier,
                                ...(member.displayName ? { displayName: member.displayName } : {}),
                            })),
                        },
                        requestController?.signal,
                    ),
                ),
            );
            const nextPolicies = { ...policies };
            const nextFingerprints = { ...savedFingerprints };
            for (const policy of updates) {
                nextPolicies[policy.role] = policy;
                nextFingerprints[policy.role] = policyFingerprint(policy);
            }
            policies = nextPolicies;
            savedFingerprints = nextFingerprints;
            saved = true;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            if (error instanceof RoomAccessConflictError) {
                conflict = true;
                return;
            }
            console.error("Could not save room access", error);
            saveError = true;
        } finally {
            isSaving = false;
        }
    }

    function roleLabel(role: RoomAccessRole): string {
        return $LL.mapEditor.settings.editorAccess.roles[role].title();
    }

    function roleDescription(role: RoomAccessRole): string {
        return $LL.mapEditor.settings.editorAccess.roles[role].description();
    }

    function modeLabel(mode: RoomAccessMode): string {
        return $LL.mapEditor.settings.editorAccess.modes[mode].title();
    }
</script>

<section class="flex flex-col gap-5" aria-labelledby="room-access-title" aria-busy={isLoading || isSaving}>
    <div>
        <h3 id="room-access-title" class="text-white">{$LL.mapEditor.settings.editorAccess.title()}</h3>
        <p class="text-sm opacity-80">{$LL.mapEditor.settings.editorAccess.description()}</p>
    </div>

    {#if isLoading}
        <p class="py-6 text-center" aria-live="polite">{$LL.mapEditor.settings.editorAccess.loading()}</p>
    {:else if loadError}
        <div
            class="flex flex-col items-start gap-3 rounded-lg border border-danger-900/50 bg-danger-900/20 p-4"
            role="alert"
        >
            <p>{$LL.mapEditor.settings.editorAccess.errors.load()}</p>
            <Button variant="contrast" appearance="border" size="sm" onclick={() => load()}>
                {$LL.mapEditor.settings.editorAccess.actions.retry()}
            </Button>
        </div>
    {:else}
        <form
            class="flex flex-col gap-6"
            onsubmit={async (event) => {
                event.preventDefault();
                await save();
            }}
        >
            <p class="rounded-lg border border-info-900/50 bg-info-900/20 p-3 text-sm">
                {$LL.mapEditor.settings.editorAccess.hierarchyNotice()}
            </p>

            <div class="overflow-x-auto rounded-lg border border-white/10">
                <table class="w-full min-w-[42rem] border-collapse text-left text-sm">
                    <tbody>
                        {#each roles as role (role)}
                            <tr class="border-t border-white/10 align-top">
                                <td class="bg-transparent p-3 font-normal text-inherit">
                                    <strong class="block">{roleLabel(role)}</strong>
                                    <span class="opacity-70">{roleDescription(role)}</span>
                                </td>
                                {#each modes as mode (mode)}
                                    <td class="p-3">
                                        <label class="flex cursor-pointer items-center gap-2">
                                            <input
                                                type="radio"
                                                name={`room-access-${role}`}
                                                value={mode}
                                                checked={policies[role].mode === mode}
                                                onchange={() => updatePolicy(role, { mode })}
                                                disabled={isSaving}
                                            />
                                            <span>{modeLabel(mode)}</span>
                                        </label>
                                    </td>
                                {/each}
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <fieldset class="flex flex-col gap-3 rounded-lg border border-white/10 p-4" disabled={isSaving}>
                <legend class="px-1 font-semibold">{$LL.mapEditor.settings.editorAccess.addByUsername.title()}</legend>
                <p class="text-sm opacity-75">{$LL.mapEditor.settings.editorAccess.addByUsername.description()}</p>
                <div class="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
                    <label class="flex flex-col gap-1">
                        <span class="text-sm">{$LL.mapEditor.settings.editorAccess.identifier.label()}</span>
                        <input
                            class="rounded border border-white/20 bg-black/20 p-2"
                            bind:value={identifier}
                            placeholder={$LL.mapEditor.settings.editorAccess.identifier.placeholder()}
                        />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-sm">{$LL.mapEditor.settings.editorAccess.displayName.label()}</span>
                        <input
                            class="rounded border border-white/20 bg-black/20 p-2"
                            bind:value={displayName}
                            placeholder={$LL.mapEditor.settings.editorAccess.displayName.placeholder()}
                        />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-sm">{$LL.mapEditor.settings.editorAccess.roleLabel()}</span>
                        <select class="rounded border border-white/20 bg-black/20 p-2" bind:value={newMemberRole}>
                            {#each roles as role (role)}<option value={role}>{roleLabel(role)}</option>{/each}
                        </select>
                    </label>
                    <Button type="button" variant="contrast" appearance="border" onclick={addTypedMember}>
                        {$LL.mapEditor.settings.editorAccess.actions.add()}
                    </Button>
                </div>
                {#if addError}<p class="text-sm text-danger-800" role="alert">
                        {$LL.mapEditor.settings.editorAccess.errors[addError]()}
                    </p>{/if}
            </fieldset>

            <section class="flex flex-col gap-3" aria-labelledby="visitor-history-title">
                <div>
                    <h4 id="visitor-history-title" class="font-semibold">
                        {$LL.mapEditor.settings.editorAccess.visitors.title()}
                    </h4>
                    <p class="text-sm opacity-75">{$LL.mapEditor.settings.editorAccess.visitors.description()}</p>
                </div>
                <input
                    class="rounded border border-white/20 bg-black/20 p-2"
                    bind:value={visitorSearch}
                    placeholder={$LL.mapEditor.settings.editorAccess.visitors.search()}
                />
                {#if filteredVisitors.length === 0}
                    <p class="rounded-lg border border-white/10 p-4 text-sm opacity-75">
                        {$LL.mapEditor.settings.editorAccess.visitors.empty()}
                    </p>
                {:else}
                    <div class="max-h-80 overflow-auto rounded-lg border border-white/10">
                        <table class="w-full min-w-[42rem] border-collapse text-left text-sm">
                            <thead class="sticky top-0 bg-gray-900">
                                <tr>
                                    <th class="p-3">{$LL.mapEditor.settings.editorAccess.visitors.person()}</th>
                                    <th class="p-3">{$LL.mapEditor.settings.editorAccess.visitors.lastVisit()}</th>
                                    {#each roles as role (role)}<th class="p-3">{roleLabel(role)}</th>{/each}
                                </tr>
                            </thead>
                            <tbody>
                                {#each filteredVisitors as visitor (visitor.userId)}
                                    <tr class="border-t border-white/10">
                                        <td class="p-3">
                                            <strong class="block">{visitor.displayName}</strong>
                                            <span class="opacity-65">{visitor.identifier}</span>
                                        </td>
                                        <td class="p-3">
                                            {new Date(visitor.lastVisitedAt).toLocaleString()}
                                            <span class="block opacity-65"
                                                >{$LL.mapEditor.settings.editorAccess.visitors.visitCount({
                                                    count: visitor.visitCount,
                                                })}</span
                                            >
                                        </td>
                                        {#each roles as role (role)}
                                            <td class="p-3">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`${roleLabel(role)}: ${visitor.displayName}`}
                                                    checked={hasMember(role, visitor.identifier)}
                                                    onchange={() => toggleVisitorRole(visitor, role)}
                                                    disabled={isSaving}
                                                />
                                            </td>
                                        {/each}
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </section>

            {#each roles as role (role)}
                {#if policies[role].members.length > 0}
                    <section class="flex flex-col gap-2">
                        <h4 class="font-semibold">
                            {roleLabel(role)} · {$LL.mapEditor.settings.editorAccess.specificMembers()}
                        </h4>
                        <div class="flex flex-wrap gap-2">
                            {#each policies[role].members as member (member.identifier)}
                                <span
                                    class="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-sm"
                                >
                                    {member.displayName || member.identifier}
                                    <button
                                        type="button"
                                        class="font-bold"
                                        aria-label={$LL.mapEditor.settings.editorAccess.actions.removeLabel({
                                            name: member.displayName || member.identifier,
                                        })}
                                        onclick={() => removeMember(role, member.identifier)}>×</button
                                    >
                                </span>
                            {/each}
                        </div>
                    </section>
                {/if}
            {/each}

            {#if conflict}
                <div
                    class="flex flex-col items-start gap-3 rounded-lg border border-warning-900/50 bg-warning-900/20 p-3"
                    role="alert"
                >
                    <p>{$LL.mapEditor.settings.editorAccess.errors.conflict()}</p>
                    <Button type="button" variant="contrast" appearance="border" size="sm" onclick={() => load()}
                        >{$LL.mapEditor.settings.editorAccess.actions.reload()}</Button
                    >
                </div>
            {:else if saveError}
                <p class="text-danger-800" role="alert">{$LL.mapEditor.settings.editorAccess.errors.save()}</p>
            {:else if saved}
                <p class="text-success-800" aria-live="polite">{$LL.mapEditor.settings.editorAccess.saved()}</p>
            {/if}

            <div class="flex justify-end">
                <Button type="submit" variant="primary" disabled={!canSave}
                    >{isSaving
                        ? $LL.mapEditor.settings.editorAccess.saving()
                        : $LL.mapEditor.settings.editorAccess.actions.save()}</Button
                >
            </div>
        </form>
    {/if}
</section>
