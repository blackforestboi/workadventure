import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "يتبع {leader}", // following {leader}
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "في انتظار التأكيد...", // Waiting for confirmation...
        followed: {
            one: "{follower} يتبعك", // {follower} is following you
            two: "{firstFollower} و {secondFollower} يتبعانك", // {firstFollower} and {secondFollower} are following you
            many: "{followers} و {lastFollower} يتبعونك", // {followers} and {lastFollower} are following you
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "تفاعل", // Interaction
            follow: "هل ترغب في متابعة {leader}؟", // Do you want to follow {leader}?
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "هل ترغب في عدم الاستمرار في القيادة؟", // Do you not want to continue leading?
            follower: "هل ترغب في عدم متابعة {leader} بعد الآن؟", // Do you not want to follow {leader} anymore?
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "نعم", // Yes
        no: "لا", // No
    },
    actionName: "تحديد الموقع",
};
export default follow;
