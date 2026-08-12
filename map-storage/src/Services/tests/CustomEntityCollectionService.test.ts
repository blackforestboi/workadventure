import {
    CustomEntityDirection,
    type ModifyCustomEntityMessage,
    type UploadEntityMessage,
} from "@workadventure/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fileSystemMock = vi.hoisted(() => ({
    writeByteArrayAsFile: vi.fn(),
    writeStringAsFile: vi.fn(),
    readFileAsString: vi.fn(),
    exist: vi.fn(),
    deleteFiles: vi.fn(),
}));

vi.mock("../../fileSystem", () => ({ fileSystem: fileSystemMock }));

import { CustomEntityCollectionService } from "../CustomEntityCollectionService";

const uploadEntityMessage: UploadEntityMessage = {
    id: "entity-id",
    file: new Uint8Array([1, 2, 3]),
    direction: CustomEntityDirection.Down,
    name: "Generated tree",
    tags: ["Nature"],
    imagePath: "entity-id-generated-tree.png",
    color: "",
};

const emptyCollection = JSON.stringify({
    version: "1.0",
    collectionName: "custom entities",
    collection: [],
    tags: [],
});

describe("CustomEntityCollectionService", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        fileSystemMock.exist.mockResolvedValue(true);
        fileSystemMock.readFileAsString.mockResolvedValue(emptyCollection);
        fileSystemMock.writeByteArrayAsFile.mockResolvedValue(undefined);
        fileSystemMock.writeStringAsFile.mockResolvedValue(undefined);
    });

    it("rejects an empty image before creating a catalog entry", async () => {
        const service = new CustomEntityCollectionService("maps.example.test");

        await expect(
            service.uploadEntity({
                ...uploadEntityMessage,
                file: new Uint8Array(),
            }),
        ).rejects.toThrow("Cannot upload an empty custom entity image");
        expect(fileSystemMock.writeByteArrayAsFile).not.toHaveBeenCalled();
        expect(fileSystemMock.writeStringAsFile).not.toHaveBeenCalled();
    });

    it("does not resolve an upload before the custom entity collection write is durable", async () => {
        let finishCollectionWrite: (() => void) | undefined;
        fileSystemMock.writeStringAsFile.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishCollectionWrite = resolve;
                }),
        );
        const service = new CustomEntityCollectionService("maps.example.test");
        let uploadSettled = false;

        const upload = service.uploadEntity(uploadEntityMessage).then(() => {
            uploadSettled = true;
        });
        await vi.waitFor(() => expect(fileSystemMock.writeStringAsFile).toHaveBeenCalledOnce());

        expect(uploadSettled).toBe(false);
        finishCollectionWrite?.();
        await upload;
        expect(uploadSettled).toBe(true);
    });

    it("replaces the existing entity with the same id when an acknowledgement is lost and the upload is retried", async () => {
        fileSystemMock.readFileAsString.mockResolvedValue(
            JSON.stringify({
                version: "1.0",
                collectionName: "custom entities",
                collection: [{ ...uploadEntityMessage, name: "Old tree", direction: "Down" }],
                tags: [],
            }),
        );
        const service = new CustomEntityCollectionService("maps.example.test");

        await service.uploadEntity(uploadEntityMessage);

        const persistedCollection = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[0][1] as string) as {
            collection: { id: string; name: string }[];
        };
        expect(persistedCollection.collection).toHaveLength(1);
        expect(persistedCollection.collection[0]).toEqual(
            expect.objectContaining({ id: "entity-id", name: "Generated tree" }),
        );
    });

    it("persists optional animation metadata beside the entity image", async () => {
        const animation = { frameWidth: 32, frameHeight: 32, frameCount: 4, frameDurationMs: 200 };
        const service = new CustomEntityCollectionService("maps.example.test");

        await service.uploadEntity({ ...uploadEntityMessage, animation });

        const persistedCollection = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[0][1] as string) as {
            collection: { animation?: unknown }[];
        };
        expect(persistedCollection.collection[0]?.animation).toEqual(animation);
    });

    it("persists the editor positioning metadata for newly created assets", async () => {
        const service = new CustomEntityCollectionService("maps.example.test");

        await service.uploadEntity({
            ...uploadEntityMessage,
            collisionGrid: [
                [1, 0],
                [0, 1],
            ],
            defaultSizeInTiles: 0.5,
            defaultHeightInTiles: 3,
            previewPadding: -28,
        });

        const persistedCollection = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[0][1] as string) as {
            collection: {
                collisionGrid?: number[][];
                defaultSizeInTiles?: number;
                defaultHeightInTiles?: number;
                previewPadding?: number;
            }[];
        };
        expect(persistedCollection.collection[0]?.collisionGrid).toEqual([
            [1, 0],
            [0, 1],
        ]);
        expect(persistedCollection.collection[0]?.defaultSizeInTiles).toBe(0.5);
        expect(persistedCollection.collection[0]?.defaultHeightInTiles).toBe(3);
        expect(persistedCollection.collection[0]?.previewPadding).toBe(-28);
    });

    it("keeps a saved asset update available to every map client", async () => {
        const service = new CustomEntityCollectionService("maps.example.test");
        await service.uploadEntity({ ...uploadEntityMessage, defaultSizeInTiles: 1 });
        fileSystemMock.readFileAsString.mockResolvedValueOnce(
            fileSystemMock.writeStringAsFile.mock.calls[0][1] as string,
        );
        const update: ModifyCustomEntityMessage = {
            id: uploadEntityMessage.id,
            name: "Updated tree",
            tags: ["Nature", "Large"],
            collisionGrid: [[1]],
            depthOffset: -8,
            defaultSizeInTiles: 4,
            defaultHeightInTiles: 2,
            previewPadding: 12,
        };

        await service.modifyEntity(update);

        const persistedCollection = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[1][1] as string) as {
            collection: {
                name: string;
                tags: string[];
                collisionGrid?: number[][];
                depthOffset?: number;
                defaultSizeInTiles?: number;
                defaultHeightInTiles?: number;
                previewPadding?: number;
            }[];
        };
        expect(persistedCollection.collection[0]).toMatchObject({
            name: "Updated tree",
            tags: ["Nature", "Large"],
            collisionGrid: [[1]],
            depthOffset: -8,
            defaultSizeInTiles: 4,
            defaultHeightInTiles: 2,
            previewPadding: 12,
        });
    });

    it("serializes collection updates across service instances for the same map", async () => {
        let persistedCollection = emptyCollection;
        let finishFirstWrite: (() => void) | undefined;
        let writeCount = 0;
        fileSystemMock.readFileAsString.mockImplementation(() => Promise.resolve(persistedCollection));
        fileSystemMock.writeStringAsFile.mockImplementation(async (_path: string, content: string) => {
            writeCount += 1;
            if (writeCount === 1) {
                await new Promise<void>((resolve) => {
                    finishFirstWrite = resolve;
                });
            }
            persistedCollection = content;
        });
        const firstService = new CustomEntityCollectionService("maps.example.test");
        const secondService = new CustomEntityCollectionService("maps.example.test");

        const firstUpload = firstService.uploadEntity(uploadEntityMessage);
        const secondUpload = secondService.uploadEntity({
            ...uploadEntityMessage,
            id: "second-entity-id",
            imagePath: "second-entity-id-generated-rock.png",
            name: "Generated rock",
        });
        await vi.waitFor(() => expect(fileSystemMock.writeStringAsFile).toHaveBeenCalledOnce());
        expect(fileSystemMock.readFileAsString).toHaveBeenCalledOnce();

        finishFirstWrite?.();
        await Promise.all([firstUpload, secondUpload]);

        const parsedCollection = JSON.parse(persistedCollection) as { collection: { id: string }[] };
        expect(parsedCollection.collection.map(({ id }) => id)).toEqual(["entity-id", "second-entity-id"]);
    });
});
