import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "Siguiendo a {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "Esperando la confirmación de los seguidores",
        followed: {
            one: "{follower} le está siguiendo",
            two: "{firstFollower} y {secondFollower} le están siguiendo",
            many: "{followers} y {lastFollower} le están siguiendo",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "Interacción",
            follow: "¿Quiere seguir a {leader}?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "¿Quiere dejar de liderar?",
            follower: "¿Quiere dejar de seguir a {leader}?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Sí",
        no: "No",
    },
    actionName: "Localizar",
};

export default follow;
