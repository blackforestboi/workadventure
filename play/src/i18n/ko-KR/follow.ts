import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "{leader}님을 따라가는 중",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "팔로워 확인 대기 중",
        followed: {
            one: "{follower}님이 당신을 따라가는 중입니다",
            two: "{firstFollower}님과 {secondFollower}님이 당신을 따라가는 중입니다",
            many: "{followers}님과 {lastFollower}님이 당신을 따라가는 중입니다",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "상호작용",
            follow: "{leader}님을 따라가시겠습니까?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "길 안내를 중단하시겠습니까?",
            follower: "{leader}님 따라가기를 중단하시겠습니까?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "예",
        no: "아니오",
    },
    actionName: "위치 찾기",
};

export default follow;
