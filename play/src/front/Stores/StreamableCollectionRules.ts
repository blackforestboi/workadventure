import { AvailabilityStatus } from "@workadventure/messages";

export type LocalCameraPeerDisplayOptions = {
    hasCameraDevice: boolean;
    isCameraEnergySaving: boolean;
    isSilent: boolean;
    isInActiveConversation: boolean;
    isListener: boolean;
    listenerSharingCamera: boolean;
    availabilityStatus: AvailabilityStatus;
};

export function shouldDisplayLocalCameraPeer({
    hasCameraDevice,
    isCameraEnergySaving,
    isSilent,
    isInActiveConversation,
    isListener,
    listenerSharingCamera,
    availabilityStatus,
}: LocalCameraPeerDisplayOptions): boolean {
    if (!hasCameraDevice || isCameraEnergySaving || isSilent) {
        return false;
    }

    const isUnavailableStatus =
        availabilityStatus === AvailabilityStatus.DENY_PROXIMITY_MEETING ||
        availabilityStatus === AvailabilityStatus.SILENT ||
        availabilityStatus === AvailabilityStatus.DO_NOT_DISTURB ||
        availabilityStatus === AvailabilityStatus.BACK_IN_A_MOMENT ||
        availabilityStatus === AvailabilityStatus.SOUND_BLOCKED ||
        availabilityStatus === AvailabilityStatus.BUSY;

    if (isUnavailableStatus) {
        return false;
    }

    if (isListener && !listenerSharingCamera) {
        return false;
    }

    if (!isInActiveConversation) {
        return false;
    }

    return true;
}
