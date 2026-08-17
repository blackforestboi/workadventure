import { Command, type WAMFileFormat } from "@workadventure/map-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileSystemMock = vi.hoisted(() => ({
    readFileAsString: vi.fn(),
    writeStringAsFile: vi.fn(),
}));

vi.mock("../fileSystem", () => ({ fileSystem: fileSystemMock }));

import { MapsManager } from "../MapsManager";

const mapKey = "maps.example.test/world.wam";
const initialWam: WAMFileFormat = {
    version: "1.0.0",
    mapUrl: "world.tmj",
    areas: [],
    entities: {},
    entityCollections: [],
};

class SetMetadataFieldCommand extends Command {
    public constructor(
        private readonly wam: WAMFileFormat,
        private readonly field: "name" | "description",
        private readonly value: string,
        commandId: string,
    ) {
        super(commandId);
    }

    public execute(): Promise<void> {
        this.wam.metadata ??= {};
        this.wam.metadata[this.field] = this.value;
        return Promise.resolve();
    }
}

describe("MapsManager", () => {
    let persistedWam: string;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.resetAllMocks();
        persistedWam = JSON.stringify(initialWam);
        fileSystemMock.readFileAsString.mockImplementation(() => Promise.resolve(persistedWam));
        fileSystemMock.writeStringAsFile.mockImplementation((_key: string, content: string) => {
            persistedWam = content;
            return Promise.resolve();
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("does not rewrite an acknowledged map later from a background snapshot", async () => {
        const manager = new MapsManager();
        const wamFile = await manager.loadWAMToMemory(mapKey);

        await manager.executeCommand(
            mapKey,
            "maps.example.test",
            new SetMetadataFieldCommand(wamFile.getWam(), "name", "Saved name", "command-1"),
        );
        expect(fileSystemMock.writeStringAsFile).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(60_000);

        expect(fileSystemMock.writeStringAsFile).toHaveBeenCalledTimes(1);
    });

    it("reloads durable state so a stale instance preserves previously acknowledged edits", async () => {
        const firstInstance = new MapsManager();
        const staleInstance = new MapsManager();
        const firstWam = await firstInstance.loadWAMToMemory(mapKey);
        await staleInstance.loadWAMToMemory(mapKey);

        await firstInstance.executeCommand(
            mapKey,
            "maps.example.test",
            new SetMetadataFieldCommand(firstWam.getWam(), "name", "First edit", "command-1"),
        );

        const freshWam = await staleInstance.loadWAMToMemory(mapKey);
        await staleInstance.executeCommand(
            mapKey,
            "maps.example.test",
            new SetMetadataFieldCommand(freshWam.getWam(), "description", "Second edit", "command-2"),
        );

        expect(JSON.parse(persistedWam)).toMatchObject({
            metadata: { name: "First edit", description: "Second edit" },
        });
    });
});
