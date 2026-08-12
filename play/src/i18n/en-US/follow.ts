import type { BaseTranslation } from "../i18n-types";

const follow: BaseTranslation = {
    interactStatus: {
        following: "Following {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "Waiting for followers confirmation",
        followed: {
            one: "{follower} is following you",
            two: "{firstFollower} and {secondFollower} are following you",
            many: "{followers} and {lastFollower} are following you",
        },
        voicePinnedBy: {
            one: "{follower} has pinned voice with you",
            many: "Voice is pinned with {count} users",
        },
    },
    interactMenu: {
        title: {
            interact: "Interaction",
            follow: "Do you want to follow {leader}?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Do you want to stop leading the way?",
            follower: "Do you want to stop following {leader}?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Yes",
        no: "No",
    },
    actionName: "Locate",
};

export default follow;
