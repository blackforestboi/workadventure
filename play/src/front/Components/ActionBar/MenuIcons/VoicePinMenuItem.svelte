<script lang="ts">
    import { IconMicrophone } from "@wa-icons";
    import { analyticsClient } from "../../../Administration/AnalyticsClient";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import {
        followConnectionModeStore,
        followRoleStore,
        followStateStore,
        followUsersStore,
    } from "../../../Stores/FollowStore";
    import { openedMenuStore } from "../../../Stores/MenuStore";
    import LL from "../../../../i18n/i18n-svelte";
    import ActionBarButton from "../ActionBarButton.svelte";

    function voicePinClick() {
        switch ($followStateStore) {
            case "off":
                followConnectionModeStore.set("voice");
                gameManager.getCurrentGameScene().connection?.emitFollowRequest(false, true);
                followRoleStore.set("leader");
                followStateStore.set("active");
                break;
            case "requesting":
            case "active":
            case "ending":
                gameManager.getCurrentGameScene().connection?.emitFollowAbort();
                followUsersStore.stopFollowing();
                break;
        }
    }
</script>

<ActionBarButton
    onclick={() => {
        analyticsClient.pinMeetingAction();
        voicePinClick();
    }}
    classList="group/btn-voice-pin"
    tooltipTitle={$followStateStore === "active"
        ? $LL.actionbar.help.unpinVoice.title()
        : $LL.actionbar.help.voicePin.title()}
    disabledHelp={$openedMenuStore !== undefined}
    state={$followStateStore === "active" ? "active" : "normal"}
    desc={$followStateStore === "active" ? $LL.actionbar.help.unpinVoice.desc() : $LL.actionbar.help.voicePin.desc()}
>
    <IconMicrophone class="h-6 w-6" />
</ActionBarButton>
