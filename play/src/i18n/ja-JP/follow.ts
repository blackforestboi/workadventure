import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "{leader} をフォローします",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "フォロワーの確認を待っています",
        followed: {
            one: "{follower} がフォローしています",
            two: "{firstFollower} と {secondFollower} がフォローしています",
            many: "{followers} と {lastFollower} がフォローしています",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "対応",
            follow: "{leader} をフォローしますか？",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "先導をやめますか？",
            follower: "{leader} のフォローをやめますか？",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "はい",
        no: "いいえ",
    },
    actionName: "位置を特定",
};

export default follow;
