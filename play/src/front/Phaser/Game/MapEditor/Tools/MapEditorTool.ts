import type { EditMapCommandMessage } from "@workadventure/messages";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import type { MapEditorHistoryAction } from "../MapEditorKeyboardShortcuts";

export abstract class MapEditorTool {
    public abstract update(time: number, dt: number): void;
    public abstract clear(): void;
    public abstract activate(): void;
    public abstract destroy(): void;
    public abstract subscribeToGameMapFrontWrapperEvents(gameMapFrontWrapper: GameMapFrontWrapper): void;
    public abstract handleKeyDownEvent(event: KeyboardEvent): void;
    public cancelCurrentAction?(): boolean;
    public handleHistoryAction?(action: MapEditorHistoryAction): boolean;
    /**
     * React on commands coming from the outside
     */
    public abstract handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void>;
}
