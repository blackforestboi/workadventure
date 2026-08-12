import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "Volgt {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "Wachten op bevestiging van volgers",
        followed: {
            one: "{follower} volgt je",
            two: "{firstFollower} en {secondFollower} volgen je",
            many: "{followers} en {lastFollower} volgen je",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "Interacties",
            follow: "Wil je {leader} volgen?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Wil je stoppen met de weg leiden?",
            follower: "Wil je stoppen met {leader} volgen?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Ja",
        no: "Nee",
    },
    actionName: "Lokaliseren",
};

export default follow;
