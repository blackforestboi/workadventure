import * as Phaser from "phaser";
import type { Entity } from "../../../ECS/Entity";
import type { GameScene } from "../../GameScene";
import {
    resizeBoundsFromCorner,
    type EntityBounds as Bounds,
    type EntityResizeCorner as Corner,
} from "./EntityResizeMath";

const HANDLE_SIZE = 10;

export class EntityResizeHandles {
    private readonly outline: Phaser.GameObjects.Graphics;
    private readonly handles = new Map<Corner, Phaser.GameObjects.Rectangle>();
    private readonly shiftKey: Phaser.Input.Keyboard.Key | undefined;
    private dragStart: Bounds | undefined;
    private currentBounds: Bounds | undefined;

    constructor(
        private readonly scene: GameScene,
        private readonly entity: Entity,
    ) {
        this.outline = scene.add.graphics();
        this.shiftKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.createHandle("north-west", "nwse-resize");
        this.createHandle("north-east", "nesw-resize");
        this.createHandle("south-east", "nwse-resize");
        this.createHandle("south-west", "nesw-resize");
        this.update();
    }

    public update(): void {
        const bounds = this.getOutlineBounds();
        const depth = this.entity.depth + 10;
        this.outline.clear().lineStyle(2, 0x53d8fb, 0.95).strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        const collisionGrid = this.entity.getCollisionGrid();
        if (collisionGrid?.length && collisionGrid[0]?.length) {
            const columns = Math.max(...collisionGrid.map((row) => row.length));
            const tileWidth = bounds.width / columns;
            const tileHeight = bounds.height / collisionGrid.length;
            this.outline.lineStyle(1, 0x53d8fb, 0.8);
            for (let column = 1; column < columns; column += 1) {
                const x = bounds.x + column * tileWidth;
                this.outline.lineBetween(x, bounds.y, x, bounds.y + bounds.height);
            }
            for (let row = 1; row < collisionGrid.length; row += 1) {
                const y = bounds.y + row * tileHeight;
                this.outline.lineBetween(bounds.x, y, bounds.x + bounds.width, y);
            }
        }
        this.outline.setDepth(depth);
        this.positionHandle("north-west", bounds.x, bounds.y, depth + 1);
        this.positionHandle("north-east", bounds.x + bounds.width, bounds.y, depth + 1);
        this.positionHandle("south-east", bounds.x + bounds.width, bounds.y + bounds.height, depth + 1);
        this.positionHandle("south-west", bounds.x, bounds.y + bounds.height, depth + 1);
    }

    public destroy(): void {
        this.outline.destroy();
        for (const handle of this.handles.values()) handle.destroy();
        this.handles.clear();
    }

    private createHandle(corner: Corner, cursor: string): void {
        const handle = this.scene.add
            .rectangle(0, 0, HANDLE_SIZE, HANDLE_SIZE, 0xffffff, 1)
            .setStrokeStyle(2, 0x17171c, 1)
            .setInteractive({ cursor });
        this.scene.input.setDraggable(handle);
        handle.on(Phaser.Input.Events.DRAG_START, () => {
            this.dragStart = this.getBounds();
            this.currentBounds = this.dragStart;
            this.entity.beginEditorResize(this.dragStart);
        });
        handle.on(Phaser.Input.Events.DRAG, (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            if (this.dragStart === undefined) return;
            const bounds = resizeBoundsFromCorner(this.dragStart, corner, dragX, dragY, !this.shiftKey?.isDown);
            this.currentBounds = bounds;
            this.entity.previewEditorBounds(bounds);
            this.update();
            this.scene.markDirty();
        });
        handle.on(Phaser.Input.Events.DRAG_END, () => {
            if (this.currentBounds !== undefined) this.entity.commitEditorBounds(this.currentBounds);
            this.dragStart = undefined;
            this.currentBounds = undefined;
            this.scene.markDirty();
        });
        this.handles.set(corner, handle);
    }

    private positionHandle(corner: Corner, x: number, y: number, depth: number): void {
        this.handles.get(corner)?.setPosition(x, y).setDepth(depth);
    }

    private getBounds(): Bounds {
        return {
            x: this.entity.x,
            y: this.entity.y,
            width: this.entity.displayWidth,
            height: this.entity.displayHeight,
        };
    }

    private getOutlineBounds(): Bounds {
        const collisionGrid = this.entity.getCollisionGrid();
        if (!collisionGrid?.length || !collisionGrid[0]?.length) {
            return this.getBounds();
        }
        const position = this.entity.getCollisionGridPosition();
        return {
            x: position.x,
            y: position.y,
            width: Math.max(...collisionGrid.map((row) => row.length)) * 32,
            height: collisionGrid.length * 32,
        };
    }
}
