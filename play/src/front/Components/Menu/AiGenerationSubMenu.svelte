<script lang="ts">
    import { aiGenerationSettingsVisibilityStore } from "../../Stores/AiGenerationSettingsVisibilityStore";
    import { assetGenerationSettings } from "../../Services/AssetGeneration/AssetGenerationSettings";
    import Button from "../UI/Button.svelte";
    import { IconAdjustements } from "@wa-icons";

    const connectionSummary = $derived(
        $assetGenerationSettings.lifecycle === "connected" ? "OpenRouter connected" : "Not connected",
    );
</script>

<div class="divide-y divide-white/20">
    <section class="flex flex-col p-0 first:pt-0 pt-8 m-0">
        <div class="bg-contrast font-bold text-lg p-4 flex items-center">
            <div class="me-4 opacity-50"><IconAdjustements /></div>
            AI models
        </div>
        <div class="p-4">
            <p class="max-w-2xl text-sm text-white/65">
                Connect your OpenRouter key for avatar, object, floor, and proposal generation.
            </p>
            <div class="mt-5 flex items-center justify-between gap-4 rounded-lg border border-white/15 bg-black/20 p-4">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-white/50">Current connection</p>
                    <p class="mt-1 text-sm font-semibold">{connectionSummary}</p>
                </div>
                <Button
                    variant="primary"
                    size="sm"
                    class="shrink-0"
                    onclick={() => aiGenerationSettingsVisibilityStore.open()}>Configure AI</Button
                >
            </div>
        </div>
    </section>
</div>
