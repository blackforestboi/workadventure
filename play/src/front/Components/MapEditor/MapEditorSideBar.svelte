<script lang="ts">
    // import { createPopperActions } from "svelte-popperjs";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { EditorToolName } from "../../Phaser/Game/MapEditor/MapEditorModeManager";
    import { mapEditorSelectedToolStore, mapEditorVisibilityStore } from "../../Stores/MapEditorStore";
    import { analyticsClient } from "../../Administration/AnalyticsClient";
    import { mapEditorActivated, mapEditorActivatedForThematics } from "../../Stores/MenuStore";
    import ArrowBarRight from "../Icons/ArrowBarRight.svelte";
    import type { WorkAdventureComponent } from "../../../types/component";
    import { IconX, IconTexture, IconLamp, IconMapSearch, IconSettings, IconTrash } from "@wa-icons";

    type SideBarTool = {
        toolName: EditorToolName;
        iconComponent: WorkAdventureComponent;
        label: string;
        tooltiptext: string;
    };

    const direction = document.documentElement.getAttribute("dir") || "ltr";

    const exploreTheRoomTool = {
        toolName: EditorToolName.ExploreTheRoom,
        iconComponent: IconMapSearch,
        label: "Explore",
        tooltiptext: $LL.mapEditor.sideBar.exploreTheRoom(),
    };

    const entityEditorTool = {
        toolName: EditorToolName.EntityEditor,
        iconComponent: IconLamp,
        label: "Objects",
        tooltiptext: $LL.mapEditor.sideBar.entityEditor(),
    };
    const trashEditorTool = {
        toolName: EditorToolName.TrashEditor,
        iconComponent: IconTrash,
        label: "Delete",
        tooltiptext: $LL.mapEditor.sideBar.trashEditor(),
    };

    let primaryTools = $derived.by<SideBarTool[]>(() => {
        if ($mapEditorActivated) {
            return [
                {
                    toolName: EditorToolName.FloorEditor,
                    iconComponent: IconTexture,
                    label: "Terrain",
                    tooltiptext: "Paint terrain tiles",
                },
                entityEditorTool,
                {
                    toolName: EditorToolName.AreaEditor,
                    iconComponent: IconMapSearch,
                    label: "Interactions",
                    tooltiptext: $LL.mapEditor.sideBar.areaEditor(),
                },
            ];
        }
        if ($mapEditorActivatedForThematics) return [entityEditorTool];
        return [exploreTheRoomTool];
    });

    let utilityTools = $derived.by<SideBarTool[]>(() => {
        if ($mapEditorActivated) {
            return [
                {
                    toolName: EditorToolName.WAMSettingsEditor,
                    iconComponent: IconSettings,
                    label: "Room",
                    tooltiptext: $LL.mapEditor.sideBar.configureMyRoom(),
                },
                trashEditorTool,
            ];
        }
        if ($mapEditorActivatedForThematics) return [trashEditorTool];
        return [];
    });

    function switchTool(newTool: EditorToolName) {
        // The map sidebar is opened when the user clicks on the explorer for the first time.
        // If the user clicks on the Explorer again, we need to show the map sidebar.
        if (newTool === EditorToolName.ExploreTheRoom) {
            mapEditorVisibilityStore.set(!$mapEditorVisibilityStore);
        } else {
            mapEditorVisibilityStore.set(true);
        }
        analyticsClient.openMapEditorTool(newTool);
        gameManager.getCurrentGameScene().getMapEditorModeManager().equipTool(newTool);
    }

    function toggleMapEditor() {
        mapEditorVisibilityStore.set(!$mapEditorVisibilityStore);
    }
</script>

<section class="side-bar-container z-[1999] pointer-events-auto" class:!right-20={!$mapEditorVisibilityStore}>
    <!--put a section to avoid lower div to be affected by some css-->
    <div class="flex flex-col items-center gap-4 pt-24 side-bar">
        <div class="flex flex-col gap-1">
            <div class="close-window p-2 bg-contrast/80 rounded-2xl backdrop-blur-md">
                <button
                    class="p-3 hover:bg-white/10 rounded aspect-square w-12 m-0"
                    data-testid="closeMapEditorButton"
                    onclick={(event) => {
                        event.preventDefault();
                        switchTool(EditorToolName.CloseMapEditor);
                    }}
                >
                    <IconX font-size="20" />
                </button>
            </div>
            <div class="close-window p-2 bg-contrast/80 rounded-2xl backdrop-blur-md">
                <button
                    class="p-3 hover:bg-white/10 rounded aspect-square w-12 m-0"
                    data-testid="hideMapEditorButton"
                    onclick={(event) => {
                        event.preventDefault();
                        toggleMapEditor();
                    }}
                >
                    <ArrowBarRight
                        height="h-5"
                        width="w-5"
                        strokeColor="stroke-white"
                        fillColor="fill-transparent"
                        classList={`aspect-ratio transition-all ${direction === "rtl" ? "rotate-180" : ""} ${
                            $mapEditorVisibilityStore ? "" : "rotate-180"
                        }`}
                    />
                </button>
            </div>
        </div>
        <nav class="p-1.5 bg-contrast/80 rounded-2xl flex flex-col gap-1 backdrop-blur-md" aria-label="Map editor">
            {#each primaryTools as tool (tool.toolName)}
                {@const ToolIcon = tool.iconComponent}
                <div class="tool-button relative">
                    <button
                        class="peer flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 {$mapEditorSelectedToolStore ===
                        tool.toolName
                            ? 'bg-secondary'
                            : 'hover:bg-white/10'}"
                        id={tool.toolName}
                        class:active={$mapEditorSelectedToolStore === tool.toolName}
                        onclick={(event) => {
                            event.preventDefault();
                            switchTool(tool.toolName);
                        }}
                        type="button"
                    >
                        <ToolIcon font-size="22" />
                        <span class="max-w-full truncate text-[9px] font-semibold leading-3">{tool.label}</span>
                    </button>
                    <div
                        class=" bg-contrast/90 backdrop-blur-xl text-white tooltip absolute text-nowrap p-2 invisible opacity-0 transition-all peer-hover:visible peer-hover:opacity-100 rounded top-1/2 -translate-y-1/2 right-[130%]"
                    >
                        {tool.tooltiptext}
                    </div>
                </div>
            {/each}
        </nav>
        {#if utilityTools.length > 0}
            <div class="p-1.5 bg-contrast/80 rounded-2xl flex flex-col gap-1 backdrop-blur-md">
                {#each utilityTools as tool (tool.toolName)}
                    {@const ToolIcon = tool.iconComponent}
                    <div class="tool-button relative">
                        <button
                            class="peer flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 {$mapEditorSelectedToolStore ===
                            tool.toolName
                                ? 'bg-secondary'
                                : 'hover:bg-white/10'}"
                            id={tool.toolName}
                            onclick={(event) => {
                                event.preventDefault();
                                switchTool(tool.toolName);
                            }}
                            type="button"
                        >
                            <ToolIcon font-size="20" />
                            <span class="max-w-full truncate text-[9px] font-semibold leading-3">{tool.label}</span>
                        </button>
                        <div
                            class="bg-contrast/90 backdrop-blur-xl text-white tooltip absolute text-nowrap p-2 invisible opacity-0 transition-all peer-hover:visible peer-hover:opacity-100 rounded top-1/2 -translate-y-1/2 right-[130%]"
                        >
                            {tool.tooltiptext}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</section>
