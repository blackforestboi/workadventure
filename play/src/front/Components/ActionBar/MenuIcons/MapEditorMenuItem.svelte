<script lang="ts">
    import { onDestroy } from "svelte";
    import ActionBarButton from "../ActionBarButton.svelte";
    import MapEditorWorldPicker from "../../PopUp/MapEditorWorldPicker.svelte";
    import { analyticsClient } from "../../../Administration/AnalyticsClient";
    import { localUserStore } from "../../../Connection/LocalUserStore";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { EditorToolName } from "../../../Phaser/Game/MapEditor/MapEditorModeManager";
    import { isCalendarVisibleStore } from "../../../Stores/CalendarStore";
    import { mapEditorModeStore, mapExplorationModeStore } from "../../../Stores/MapEditorStore";
    import { mapEditorActivated, mapEditorMenuVisibleStore, openedMenuStore } from "../../../Stores/MenuStore";
    import { isTodoListVisibleStore } from "../../../Stores/TodoListStore";
    import { warningMessageStore } from "../../../Stores/ErrorStore";
    import { worldCreationApi } from "../../../Services/WorldCreationApi";
    import { showFloatingUi } from "../../../Utils/svelte-floatingui-show";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { IconChevronDown, IconMapEditor } from "@wa-icons";

    interface Props {
        first?: boolean;
        last?: boolean;
        classList?: string;
    }

    let { first = undefined, last = undefined, classList = undefined }: Props = $props();
    let pickerOpen = $state(false);
    let closeFloatingUi: (() => void) | undefined;
    let triggerElement: HTMLElement | undefined = $state(undefined);

    function requireLogin(): boolean {
        if (!localUserStore.isLogged()) {
            analyticsClient.login();
            window.dispatchEvent(new CustomEvent("workadventure:open-login-overlay"));
            return false;
        }
        return true;
    }

    function openThisWorld() {
        analyticsClient.toggleMapEditor(true);
        mapEditorModeStore.switchMode(true);
        gameManager.getCurrentGameScene().getMapEditorModeManager().equipTool(EditorToolName.EntityEditor);

        isTodoListVisibleStore.set(false);
        isCalendarVisibleStore.set(false);
        openedMenuStore.closeAll();
    }

    async function createNewWorld() {
        try {
            const result = await worldCreationApi.create(gameManager.currentStartedRoom.href);
            window.location.assign(result.roomUrl);
        } catch (error: unknown) {
            console.error("Unable to create a new world", error);
            warningMessageStore.addWarningMessage($LL.actionbar.mapEditorCreateError(), { closable: true });
        }
    }

    function closeWorldPicker(): void {
        const close = closeFloatingUi;
        closeFloatingUi = undefined;
        pickerOpen = false;
        close?.();
    }

    function toggleWorldPicker(): void {
        if (!$mapEditorActivated && !requireLogin()) return;
        if (closeFloatingUi !== undefined) {
            closeWorldPicker();
            return;
        }
        if (triggerElement === undefined) return;

        pickerOpen = true;
        closeFloatingUi = showFloatingUi(
            triggerElement,
            MapEditorWorldPicker,
            {
                onthisworld: openThisWorld,
                oncreatenew: localUserStore.isLogged() ? createNewWorld : undefined,
                onclose: closeWorldPicker,
            },
            { placement: "bottom-start" },
            8,
            true,
            true,
            () => {
                closeFloatingUi = undefined;
                pickerOpen = false;
            },
        );
    }

    onDestroy(closeWorldPicker);
</script>

{#if $mapEditorMenuVisibleStore}
    <ActionBarButton
        onclick={toggleWorldPicker}
        label={$LL.actionbar.mapEditor()}
        state={$mapEditorModeStore && !$mapExplorationModeStore ? "active" : "normal"}
        dataTestId="map-editor-button"
        bind:wrapperDiv={triggerElement}
        {first}
        {last}
        {classList}
    >
        <IconMapEditor font-size="20" />
        {#snippet end()}
            <IconChevronDown class="ml-auto h-4 w-4 opacity-60 transition-transform {pickerOpen ? 'rotate-180' : ''}" />
        {/snippet}
    </ActionBarButton>
{/if}
