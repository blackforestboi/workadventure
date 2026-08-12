import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "跟随 {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "等待跟随者确认",
        followed: {
            one: "{follower} 正在跟随你",
            two: "{firstFollower} 和 {secondFollower} 正在跟随你",
            many: "{followers} 和 {lastFollower} 正在跟随你",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "交互",
            follow: "要跟随 {leader} 吗？",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "要停止领路吗?",
            follower: "要停止跟随 {leader} 吗？",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "是",
        no: "否",
    },
    actionName: "定位",
};

export default follow;
