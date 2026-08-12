export function hasTemporaryRootGuestAccess(input: {
    roomId: string;
    startRoomUrl: string;
    mapEditorAllowAllUsers: boolean;
    isAnonymous: boolean;
}): boolean {
    if (!input.mapEditorAllowAllUsers || !input.isAnonymous) return false;
    const roomUrl = new URL(input.roomId);
    const startRoomUrl = new URL(input.startRoomUrl, roomUrl.origin);
    return roomUrl.pathname === startRoomUrl.pathname;
}
