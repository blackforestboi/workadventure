<script lang="ts">
    import ActionBarButton from "../ActionBarButton.svelte";
    import { analyticsClient } from "../../../Administration/AnalyticsClient";
    import { localUserStore } from "../../../Connection/LocalUserStore";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { EditorToolName } from "../../../Phaser/Game/MapEditor/MapEditorModeManager";
    import { isCalendarVisibleStore } from "../../../Stores/CalendarStore";
    import { mapEditorModeStore, mapExplorationModeStore } from "../../../Stores/MapEditorStore";
    import { mapEditorMenuVisibleStore, openedMenuStore } from "../../../Stores/MenuStore";
    import { isTodoListVisibleStore } from "../../../Stores/TodoListStore";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { IconMapEditor } from "@wa-icons";

    interface Props {
        first?: boolean;
        last?: boolean;
        classList?: string;
    }

    let { first = undefined, last = undefined, classList = undefined }: Props = $props();

    function toggleMapEditorMode() {
        if (!localUserStore.isLogged()) {
            analyticsClient.login();
            window.location.href = "/login";
            return;
        }

        if ($mapEditorModeStore && !$mapExplorationModeStore) {
            analyticsClient.toggleMapEditor(false);
            mapEditorModeStore.switchMode(false);
            gameManager.getCurrentGameScene().getMapEditorModeManager().equipTool(undefined);
        } else {
            analyticsClient.toggleMapEditor(true);
            mapEditorModeStore.switchMode(true);
            gameManager.getCurrentGameScene().getMapEditorModeManager().equipTool(EditorToolName.EntityEditor);
        }

        isTodoListVisibleStore.set(false);
        isCalendarVisibleStore.set(false);
        openedMenuStore.closeAll();
    }
</script>

{#if $mapEditorMenuVisibleStore}
    <ActionBarButton
        onclick={toggleMapEditorMode}
        label={$LL.actionbar.mapEditor()}
        state={$mapEditorModeStore && !$mapExplorationModeStore ? "active" : "normal"}
        dataTestId="map-editor-button"
        {first}
        {last}
        {classList}
    >
        <IconMapEditor font-size="20" />
    </ActionBarButton>
{/if}
