import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "{leader} folgen",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "Warten auf Bestätigung...",
        followed: {
            one: "{follower} folgt dir",
            two: "{firstFollower} und {secondFollower} folgen dir",
            many: "{followers} und {lastFollower} folgen dir",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "Interaktion",
            follow: "Möchtest du {leader} folgen?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Möchtest du nicht weiter den Weg weisen?",
            follower: "Möchtest du nicht mehr {leader} folgen?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Ja",
        no: "Nein",
    },
    actionName: "Lokalisieren",
};

export default follow;
