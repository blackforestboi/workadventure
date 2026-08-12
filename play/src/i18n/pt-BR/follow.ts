import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const follow: DeepPartial<Translation["follow"]> = {
    interactStatus: {
        following: "Seguindo {leader}",
        voicePinned: "Voice pinned to {leader}",
        waitingFollowers: "Aguardando confirmação dos seguidores",
        followed: {
            one: "{follower} está seguindo você",
            two: "{firstFollower} e {secondFollower} estão seguindo você",
            many: "{followers} e {lastFollower} estão seguindo você",
        },
        voicePinnedBy: { one: "{follower} has pinned voice with you", many: "Voice is pinned with {count} users" },
    },
    interactMenu: {
        title: {
            interact: "Interação",
            follow: "Você quer seguir {leader}?",
            voicePin: "Do you want to pin voice with {leader}?",
        },
        stop: {
            leader: "Você quer parar de liderar o caminho?",
            follower: "Você quer parar de seguir {leader}?",
            voiceFollower: "Do you want to unpin voice with {leader}?",
            voiceLeader: "Do you want to stop the voice pin?",
        },
        yes: "Sim",
        no: "Não",
    },
    actionName: "Localizar",
};

export default follow;
