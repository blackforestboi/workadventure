<script lang="ts">
    import { onMount } from "svelte";

    import type { AdmissionStatus, PendingEndorsement } from "../../Services/TeapotAdmissionApi";
    import { teapotAdmissionApi } from "../../Services/TeapotAdmissionApi";

    let enabled = $state(false);
    let loading = $state(true);
    let busy = $state(false);
    let token = $state<string | null>(null);
    let status = $state<AdmissionStatus | null>(null);
    let pending = $state<PendingEndorsement | null>(null);
    let shareUrl = $state<string | null>(null);
    let error = $state<string | null>(null);
    let inviteToken = $state<string | null>(null);
    let readyToEnter = $state(false);

    let visible = $derived(
        enabled &&
            !loading &&
            (token === null || status?.identity.admissionState !== "admitted" || inviteToken !== null || readyToEnter),
    );

    onMount(() => {
        initialize().catch(() => undefined);
    });

    async function initialize(): Promise<void> {
        enabled = await teapotAdmissionApi.isXAuthEnabled().catch(() => false);
        if (!enabled) {
            loading = false;
            return;
        }
        token = teapotAdmissionApi.getApplicationToken();
        inviteToken = teapotAdmissionApi.getInviteToken();
        if (token !== null) await refreshStatus();
        loading = false;
    }

    async function refreshStatus(): Promise<void> {
        if (token === null) return;
        busy = true;
        error = null;
        try {
            const previousState = status?.identity.admissionState;
            // eslint-disable-next-line require-atomic-updates -- refreshes are serialized by the busy UI state
            status = await teapotAdmissionApi.getStatus(token);
            readyToEnter = previousState === "pending" && status.identity.admissionState === "admitted";
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "Could not load admission status";
        } finally {
            busy = false;
        }
    }

    async function createShareLink(): Promise<void> {
        if (token === null) return;
        busy = true;
        error = null;
        try {
            shareUrl = (await teapotAdmissionApi.createShareLink(token)).shareUrl;
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "Could not create an invitation";
        } finally {
            busy = false;
        }
    }

    async function reviewInvite(): Promise<void> {
        if (token === null || inviteToken === null) return;
        busy = true;
        error = null;
        try {
            pending = await teapotAdmissionApi.createPendingEndorsement(token, inviteToken);
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "Could not review this invitation";
        } finally {
            busy = false;
        }
    }

    async function confirmInvite(): Promise<void> {
        if (token === null || pending === null) return;
        busy = true;
        error = null;
        try {
            await teapotAdmissionApi.confirmEndorsement(token, pending.confirmationToken);
            teapotAdmissionApi.clearInviteToken();
            inviteToken = null;
            // eslint-disable-next-line require-atomic-updates -- confirmation is serialized by the busy UI state
            pending = null;
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "Could not confirm this endorsement";
        } finally {
            busy = false;
        }
    }
</script>

{#if visible}
    <div class="teapot-admission-backdrop">
        <div
            class="teapot-admission-card"
            role="dialog"
            aria-modal="true"
            aria-label="Teapot Maps admission"
            aria-live="polite"
        >
            <p class="eyebrow">TEAPOT MAPS</p>
            {#if token === null}
                <h1>Enter with X</h1>
                <p>Your X account becomes your stable identity in this world.</p>
                <a class="primary" href={teapotAdmissionApi.createLoginUrl()}>Continue with X</a>
            {:else if status === null}
                <h1>Sign-in needs attention</h1>
                <p>We could not verify this session. Sign in again to continue.</p>
                <a class="primary" href={teapotAdmissionApi.createLoginUrl()}>Sign in with X</a>
            {:else if status?.identity.admissionState === "pending"}
                <h1>Three invitations open the door</h1>
                <p>
                    {status.acceptedEndorsements} of {status.requiredEndorsements} endorsements received. Share one candidate-specific
                    link with people who are already inside.
                </p>
                {#if shareUrl}
                    <label for="teapot-share-link">Your invitation link</label>
                    <input
                        id="teapot-share-link"
                        readonly
                        value={shareUrl}
                        onclick={(event) => event.currentTarget.select()}
                    />
                {:else}
                    <button class="primary" disabled={busy} onclick={createShareLink}>Create invitation link</button>
                {/if}
                <button disabled={busy} onclick={refreshStatus}>Refresh status</button>
            {:else if status?.identity.admissionState === "suspended"}
                <h1>This account is suspended</h1>
                <p>An operator needs to restore access before you can enter.</p>
            {:else if readyToEnter}
                <h1>You’re in</h1>
                <p>Three people endorsed you. Reload once to enter the world.</p>
                <button class="primary" onclick={() => window.location.reload()}>Enter the world</button>
            {:else if inviteToken !== null}
                {#if pending}
                    <h1>Endorse {pending.candidate.displayName ?? "this person"}?</h1>
                    <p>This is one of three distinct endorsements they need to join the world.</p>
                    <button class="primary" disabled={busy} onclick={confirmInvite}>Confirm endorsement</button>
                {:else}
                    <h1>Invitation to endorse</h1>
                    <p>Review the candidate before adding your endorsement.</p>
                    <button class="primary" disabled={busy} onclick={reviewInvite}>Review invitation</button>
                {/if}
            {/if}
            {#if error}<p class="error" role="alert">{error}</p>{/if}
        </div>
    </div>
{/if}

<style>
    .teapot-admission-backdrop {
        position: fixed;
        inset: 0;
        z-index: 2000;
        display: grid;
        place-items: center;
        padding: 24px;
        background: color-mix(in srgb, #151927 82%, transparent);
        backdrop-filter: blur(10px);
        pointer-events: auto;
    }

    .teapot-admission-card {
        width: min(480px, 100%);
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 32px;
        color: #f7f2e8;
        background: #23293b;
        border: 2px solid #d7c6a0;
        border-radius: 12px;
        box-shadow: 0 24px 80px #0009;
    }

    h1,
    p {
        margin: 0;
    }

    .eyebrow {
        color: #d7c6a0;
        font-size: 0.75rem;
        letter-spacing: 0.16em;
    }

    button,
    a,
    input {
        min-height: 44px;
        padding: 10px 14px;
        border-radius: 6px;
    }

    button,
    a {
        border: 1px solid #d7c6a0;
        color: inherit;
        background: transparent;
        text-align: center;
        cursor: pointer;
    }

    .primary {
        color: #171b26;
        background: #e8d7ad;
        font-weight: 700;
        text-decoration: none;
    }

    input {
        color: #171b26;
        background: #fffaf0;
        border: 0;
    }

    .error {
        color: #ff9f9f;
    }
</style>
