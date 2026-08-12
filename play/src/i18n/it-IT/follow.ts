import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "Seguendo {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "In attesa della conferma dei follower",
        followed: {
            one: "{follower} ti sta seguendo",
            two: "{firstFollower} e {secondFollower} ti stanno seguendo",
            many: "{followers} e {lastFollower} ti stanno seguendo",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "Interazione",
            follow: "Vuoi seguire {leader}?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Vuoi smettere di guidare?",
            follower: "Vuoi smettere di seguire {leader}?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Sì",
        no: "No",
    },
    actionName: "Localizza",
};

export default follow;
