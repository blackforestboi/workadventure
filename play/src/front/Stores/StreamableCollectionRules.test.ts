import { AvailabilityStatus } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { shouldDisplayLocalCameraPeer } from "./StreamableCollectionRules";

const defaultOptions = {
    hasCameraDevice: true,
    isCameraEnergySaving: false,
    isSilent: false,
    isInActiveConversation: false,
    isListener: false,
    listenerSharingCamera: false,
    availabilityStatus: AvailabilityStatus.ONLINE,
};

describe("shouldDisplayLocalCameraPeer", () => {
    it("hides the local camera outside a conversation on desktop", () => {
        expect(shouldDisplayLocalCameraPeer(defaultOptions)).toBe(false);
    });

    it("keeps the local camera peer in an active conversation", () => {
        expect(
            shouldDisplayLocalCameraPeer({
                ...defaultOptions,
                isInActiveConversation: true,
            }),
        ).toBe(true);
    });
});
