<script lang="ts">
    import LL from "../../../i18n/i18n-svelte";
    import { closeLoginOverlay } from "../../Stores/LoginOverlayStore";
    import ButtonClose from "../Input/ButtonClose.svelte";

    let loginFrame: HTMLIFrameElement;

    const loginUrl = new URL("/login-screen", window.location.origin);
    loginUrl.searchParams.set("playUri", window.location.href);
    loginUrl.searchParams.set("manuallyTriggered", "true");

    const authenticationPaths = new Set(["/login", "/login-screen", "/openid-callback", "/matrix-callback"]);

    function handleFrameLoad(): void {
        try {
            const frameUrl = new URL(loginFrame.contentWindow?.location.href ?? "");
            if (frameUrl.origin !== window.location.origin || authenticationPaths.has(frameUrl.pathname)) {
                return;
            }

            closeLoginOverlay();
            window.location.assign(frameUrl.href);
        } catch {
            // Cross-origin access is expected while the identity provider owns the frame.
        }
    }
</script>

<div
    class="fixed inset-0 z-[4000] flex items-center justify-center bg-black/70 p-3 pointer-events-auto sm:p-8"
    data-testid="loginOverlay"
>
    <section
        class="flex h-full max-h-[820px] w-full max-w-[860px] flex-col overflow-hidden rounded-3xl bg-contrast text-white shadow-2xl"
        aria-label={$LL.actionbar.login()}
    >
        <header class="flex items-center justify-between gap-4 px-5 py-4">
            <h2 class="m-0 text-xl font-semibold">{$LL.actionbar.login()}</h2>
            <ButtonClose dataTestId="closeLoginOverlay" onclick={closeLoginOverlay} />
        </header>
        <iframe
            bind:this={loginFrame}
            class="min-h-0 flex-1 border-0 bg-white"
            src={loginUrl.href}
            title={$LL.actionbar.login()}
            data-testid="loginFrame"
            onload={handleFrameLoad}
        ></iframe>
    </section>
</div>
