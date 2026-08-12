import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "Seguint a {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "Esperant la confirmació dels seguidors",
        followed: {
            one: "{follower} et segueix",
            two: "{firstFollower} i {secondFollower} et segueixen",
            many: "{followers} i {lastFollower} et segueixen",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "Interacció",
            follow: "Voleu seguir a {leader}?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Voleu deixar de liderar?",
            follower: "Voleu deixar de seguir a {leader}?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Si",
        no: "No",
    },
    actionName: "Localitzar",
};

export default follow;
