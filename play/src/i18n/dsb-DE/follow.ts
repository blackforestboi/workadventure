import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "Slědujoš {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "Cakanje na wobtwarźenje...",
        followed: {
            one: "{follower} slědujo śi",
            two: "{firstFollower} a {secondFollower} slědujotej śi",
            many: "{followers} a {lastFollower} slěduju śi",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "Interakcija",
            follow: "Coš slědowaś {leader}?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Njocoš wěcej wjednik byś?",
            follower: "Njocoš wěcej slědowaś {leader}?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Jo",
        no: "Ně",
    },
    actionName: "Lokalizěrowaś",
};

export default follow;
