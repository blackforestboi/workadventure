import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "Vous suivez {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "En attente de la confirmation des suiveurs",
        followed: {
            one: "{follower} vous suit",
            two: "{firstFollower} et {secondFollower} vous suivent",
            many: "{followers} et {lastFollower} vous suivent",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "Interaction",
            follow: "Voulez-vous suivre {leader} ?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Voulez-vous qu'on arrête de vous suivre ?",
            follower: "Voulez-vous arrêter de suivre {leader} ?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Oui",
        no: "Non",
    },
    actionName: "Localiser",
};

export default follow;
