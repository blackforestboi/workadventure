<script lang="ts">
    import { onMount } from "svelte";
    import type { AuthDict, MatrixClient } from "matrix-js-sdk";
    import { AuthType } from "matrix-js-sdk";
    import LL from "../../../../i18n/i18n-svelte";
    import ButtonClose from "../../../Components/Input/ButtonClose.svelte";
    import Button from "../../../Components/UI/Button.svelte";
    import { INTERACTIVE_AUTH_PHASE } from "./InteractiveAuthPhase";

    interface Props {
        authSessionId: string;
        matrixClient: MatrixClient;
        onPhaseChange: (nextStage: INTERACTIVE_AUTH_PHASE) => void;
        onCancel: () => void;
        submitAuthDict: (auth: AuthDict) => void;
        errorText?: string;
    }

    let {
        authSessionId,
        matrixClient,
        onPhaseChange,
        onCancel,
        submitAuthDict,
        errorText = undefined,
    }: Props = $props();

    $effect(() => {
        if (!authSessionId) throw new Error("This UIA flow requires an authSessionId");
    });

    let ssoUrl = $derived(matrixClient.getFallbackAuthUrl(AuthType.Sso, authSessionId));
    let phase = $state(INTERACTIVE_AUTH_PHASE.PRE_AUTH);
    let showAuthOverlay = $state(false);

    const onReceiveMessage = (event: { data: string; origin: string }) => {
        if (event.data === "authDone" && event.origin === matrixClient.getHomeserverUrl()) {
            showAuthOverlay = false;
        }
    };

    const onStartAuthClick = () => {
        showAuthOverlay = true;
        phase = INTERACTIVE_AUTH_PHASE.POST_AUTH;
        onPhaseChange(INTERACTIVE_AUTH_PHASE.POST_AUTH);
    };

    const onConfirmClick = () => {
        showAuthOverlay = false;
        submitAuthDict({});
    };

    const onCancelClick = () => {
        showAuthOverlay = false;
        onCancel();
    };

    onMount(() => {
        window.addEventListener("message", onReceiveMessage);
        onPhaseChange(INTERACTIVE_AUTH_PHASE.PRE_AUTH);

        return () => {
            window.removeEventListener("message", onReceiveMessage);
            showAuthOverlay = false;
        };
    });
</script>

{#if showAuthOverlay}
    <div
        class="fixed inset-0 z-[2100] flex items-center justify-center bg-black/70 p-3 pointer-events-auto sm:p-8"
        data-testid="ssoAuthOverlay"
    >
        <section
            class="flex h-full max-h-[820px] w-full max-w-[860px] flex-col overflow-hidden rounded-3xl bg-contrast text-white shadow-2xl"
            aria-label={$LL.chat.e2ee.interactiveAuth.title()}
        >
            <header class="flex items-center justify-between gap-4 px-5 py-4">
                <h2 class="m-0 text-xl font-semibold">{$LL.chat.e2ee.interactiveAuth.title()}</h2>
                <ButtonClose dataTestId="closeSSOAuthOverlay" onclick={onCancelClick} />
            </header>
            <iframe
                class="min-h-0 flex-1 border-0 bg-white"
                src={ssoUrl}
                title={$LL.chat.e2ee.interactiveAuth.title()}
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
            ></iframe>
            <footer class="flex items-center justify-end gap-3 px-5 py-4">
                <Button variant="neutral" appearance="border" onclick={onCancelClick}>
                    {$LL.chat.e2ee.interactiveAuth.buttons.cancel()}
                </Button>
                <Button variant="secondary" onclick={onConfirmClick}>
                    {$LL.chat.e2ee.interactiveAuth.buttons.finish()}
                </Button>
            </footer>
        </section>
    </div>
{/if}

{#if errorText}
    <div class="text-red-500" role="alert">{errorText}</div>
{/if}

<button class="flex-1 justify-center" onclick={onCancelClick} data-testid="cancelSSO">
    {$LL.chat.e2ee.interactiveAuth.buttons.cancel()}
</button>
{#if phase === INTERACTIVE_AUTH_PHASE.PRE_AUTH}
    <Button variant="secondary" class="flex-1" onclick={onStartAuthClick}>
        {$LL.chat.e2ee.interactiveAuth.buttons.continueSSO()}
    </Button>
{:else}
    <Button variant="secondary" class="flex-1" onclick={onConfirmClick}>
        {$LL.chat.e2ee.interactiveAuth.buttons.finish()}
    </Button>
{/if}
