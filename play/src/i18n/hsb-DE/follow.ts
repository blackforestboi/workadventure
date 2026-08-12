import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "{leader} sćěhować",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "čakaj na wobkrućenje družliny",
        followed: {
            one: "{follower} tebi slěduje",
            two: "{firstFollower} a {secondFollower} sćěhujetaj tebi",
            many: "{followers} a {lastFollower} sćěhujetaj tebi",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "interakcija",
            follow: "Chceš {leader} sćěhować?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Nochceš puć dale pokazać?",
            follower: "Nochceš wjace {leader} sćěhować?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "haj",
        no: "ně",
    },
    actionName: "Lokalizować",
};

export default follow;
