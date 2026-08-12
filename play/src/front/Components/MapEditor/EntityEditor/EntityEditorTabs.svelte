<script lang="ts">
    export interface EntityEditorTab {
        id: string;
        label: string;
    }

    interface Props {
        tabs: readonly EntityEditorTab[];
        activeTab?: string;
        spacingClass?: string;
    }

    let { tabs, activeTab = $bindable(), spacingClass = "" }: Props = $props();
</script>

<div class={`mb-3 flex gap-2 border-b border-white/10 ${spacingClass}`}>
    {#each tabs as tab (tab.id)}
        <button
            class:font-semibold={activeTab === tab.id}
            class={`border-b-2 px-3 py-2 text-sm ${activeTab === tab.id ? "border-white" : "border-transparent opacity-60"}`}
            onclick={() => (activeTab = tab.id)}
        >
            {tab.label}
        </button>
    {/each}
</div>
