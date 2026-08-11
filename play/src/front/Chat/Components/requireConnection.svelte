<script lang="ts">
    import type { Snippet } from "svelte";
    import LL from "../../../i18n/i18n-svelte";
    import messageSmileyImg from "../images/message-smiley.svg";
    import { analyticsClient } from "../../Administration/AnalyticsClient";
    import { openLoginOverlay } from "../../Stores/LoginOverlayStore";

    interface Props {
        emoji?: Snippet;
        title?: Snippet;
        buttonLabel?: Snippet;
        children?: Snippet;
    }

    let { emoji, title, buttonLabel, children }: Props = $props();

    function login(): void {
        analyticsClient.login();
        openLoginOverlay();
    }
</script>

<div class="flex flex-col items-center justify-center text-center px-4 py-12">
    {@render children?.()}
    {#if emoji}
        {@render emoji()}
    {:else}
        <img src={messageSmileyImg} alt="Smiley happy" draggable="false" />
    {/if}
    <div class="w-full text-center text-lg font-bold">
        {#if title}
            {@render title()}
        {:else}
            {$LL.chat.requiresLoginForChat()}
        {/if}
    </div>
    <div class="flex justify-center">
        <button
            type="button"
            class="flex justify-center rounded-lg h-10 bg-secondary hover:bg-secondary-800 hover:no-underline hover:text-white no-underline transition-all items-center my-4 text-base px-8 text-white"
            onclick={login}
        >
            {#if buttonLabel}
                {@render buttonLabel()}
            {:else}
                {$LL.menu.profile.login()}
            {/if}
        </button>
    </div>
</div>
