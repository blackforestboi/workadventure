import type { Command } from "@workadventure/map-editor";
import { WamFile, WAMFileFormat } from "@workadventure/map-editor";
import type { EditMapCommandMessage } from "@workadventure/messages";
import * as Sentry from "@sentry/node";
import { wamFileMigration } from "@workadventure/map-editor/src/Migrations/WamFileMigration";
import { LockByKey } from "@workadventure/shared-utils/src/LockByKey";
import { fileSystem } from "./fileSystem";
import { MapListService } from "./Services/MapListService";
import { WebHookService } from "./Services/WebHookService";
import { WEB_HOOK_URL } from "./Enum/EnvironmentVariable";

/**
 * Time after which a map edition lock operation is considered stuck and rejected, so a wedged
 * operation cannot block map edition forever.
 */
const EDITION_LOCK_TIMEOUT_MS = 10_000;

export class MapsManager {
    private loadedMaps: Map<string, WamFile>;
    private loadedMapsCommandsQueue: Map<string, EditMapCommandMessage[]>;

    private readonly editionLocks = new LockByKey<string>(
        (error, key, timeoutMs) => {
            Sentry.captureException(error, {
                tags: { key: String(key), location: "withTimeout" },
                extra: { timeoutMs },
            });
        },
        (error, key) => {
            console.error(`Edition lock callback failed for key: ${key}`, error);
            Sentry.captureException(error, {
                tags: { key: String(key), location: "editionLockCallback" },
            });
        },
    );

    private mapListService: MapListService;

    /**
     * Time after which the command will be removed from the commands queue
     */
    private readonly COMMAND_TIME_IN_QUEUE_MS = 30_000;

    constructor() {
        this.loadedMaps = new Map<string, WamFile>();
        this.loadedMapsCommandsQueue = new Map<string, EditMapCommandMessage[]>();
        this.mapListService = new MapListService(fileSystem, new WebHookService(WEB_HOOK_URL));
    }

    public waitForLock(mapKey: string, callback: () => Promise<void>): Promise<void> {
        return this.editionLocks.waitForLock(mapKey, callback, EDITION_LOCK_TIMEOUT_MS);
    }

    public async executeCommand(mapKey: string, domain: string, command: Command): Promise<void> {
        const wamFile = this.getWamFile(mapKey);
        if (!wamFile) {
            throw new Error('Could not find WAM file with key "' + mapKey + '"');
        }
        const updatedWamFile = await command.execute();
        wamFile.updateLastCommandIdProperty(command.commandId);

        // Security check: Check that the map is valid after the change (it should be, but better safe than sorry)
        WAMFileFormat.parse(wamFile.getWam());

        // An acknowledged editor command must already be durable. Do not schedule a later whole-map rewrite here:
        // another map-storage instance may have persisted newer state by the time that delayed write runs.
        await fileSystem.writeStringAsFile(mapKey, JSON.stringify(wamFile.getWam()));

        if (updatedWamFile != undefined) {
            this.mapListService
                .updateWAMFileInCache(domain, mapKey.replace(domain, ""), updatedWamFile)
                .catch((e) => console.error(e));
        }
    }

    public async executeAtomicCommand<T extends Command>(
        mapKey: string,
        domain: string,
        createCommand: (wamFile: WamFile) => T,
    ): Promise<T> {
        const current = this.getWamFile(mapKey);
        if (!current) throw new Error(`Could not find WAM file with key "${mapKey}"`);
        const candidate = new WamFile(structuredClone(current.getWam()));
        const command = createCommand(candidate);
        const updatedWamFile = await command.execute();
        candidate.updateLastCommandIdProperty(command.commandId);
        WAMFileFormat.parse(candidate.getWam());
        await fileSystem.writeStringAsFile(mapKey, JSON.stringify(candidate.getWam()));
        this.loadedMaps.set(mapKey, candidate);
        if (updatedWamFile !== undefined) {
            this.mapListService
                .updateWAMFileInCache(domain, mapKey.replace(domain, ""), updatedWamFile)
                .catch((error) => console.error(error));
        }
        return command;
    }

    public getCommandsNewerThan(mapKey: string, commandId: string | undefined): EditMapCommandMessage[] {
        // shouldn't we just apply every command on this list to the new client?
        const queue = this.loadedMapsCommandsQueue.get(mapKey);
        if (queue) {
            if (commandId === undefined) {
                return queue;
            }
            const commandIndex = queue.findIndex((command) => command.id === commandId);
            if (commandIndex === -1) {
                // Most of the time, the last command id of the map will not be part of the queue
                // This is always true unless the last change was done less that 30 seconds ago.
                // In this case, let's apply the whole queue.
                return queue;
            }
            return queue.slice(commandIndex + 1);
        }
        return [];
    }

    public async getOrLoadWamFile(key: string): Promise<WamFile> {
        let wamFile = this.getWamFile(key);
        if (!wamFile) {
            wamFile = await this.loadWAMToMemory(key);
        }
        return wamFile;
    }

    public getWamFile(key: string): WamFile | undefined {
        return this.loadedMaps.get(key);
    }

    public getLoadedMaps(): string[] {
        return Array.from(this.loadedMaps.keys());
    }

    public async loadWAMToMemory(key: string): Promise<WamFile> {
        const file = await fileSystem.readFileAsString(key);
        const wam = WAMFileFormat.parse(wamFileMigration.migrate(JSON.parse(file)));

        const wamFile = new WamFile(wam);
        this.loadedMaps.set(key, wamFile);

        return wamFile;
    }

    public clearAfterUpload(key: string): void {
        console.info(`[${new Date().toISOString()}] UPLOAD/DELETE DETECTED. CLEAR CACHE FOR: ${key}`);
        this.loadedMaps.delete(key);
        this.loadedMapsCommandsQueue.delete(key);
    }

    public addCommandToQueue(mapKey: string, message: EditMapCommandMessage): void {
        let queue = this.loadedMapsCommandsQueue.get(mapKey);
        if (queue === undefined) {
            queue = [];
            this.loadedMapsCommandsQueue.set(mapKey, queue);
        }
        queue.push(message);
        this.setCommandDeletionTimeout(mapKey, message.id);
        this.loadedMaps.get(mapKey)?.updateLastCommandIdProperty(message.id);
    }

    private setCommandDeletionTimeout(mapKey: string, commandId: string): void {
        setTimeout(() => {
            const queue = this.loadedMapsCommandsQueue.get(mapKey);
            if (!queue || queue.length === 0) {
                return;
            }
            if (queue[0].id === commandId) {
                queue.splice(0, 1);

                // If we don't have any commands anymore, let's remove the map from memory.
                // We acquire the per-map lock to ensure we don't evict while a command is
                // executing or about to be queued (addCommandToQueue is called synchronously
                // after executeCommand inside the same lock).
                if (queue.length === 0) {
                    this.editionLocks
                        .waitForLock(
                            mapKey,
                            () => {
                                // Re-check after acquiring the lock: a new command may have been
                                // added while we were waiting.
                                const currentQueue = this.loadedMapsCommandsQueue.get(mapKey);
                                if (!currentQueue || currentQueue.length === 0) {
                                    this.loadedMapsCommandsQueue.delete(mapKey);
                                    this.loadedMaps.delete(mapKey);
                                }
                                return Promise.resolve();
                            },
                            EDITION_LOCK_TIMEOUT_MS,
                        )
                        .catch((e) => {
                            console.error("Error while acquiring or processing lock for cleaning map key ", mapKey, e);
                            Sentry.captureException(e);
                        });
                }
            } else {
                console.error(
                    `[${new Date().toISOString()}] Command with id ${commandId} that is scheduled from removal in the queue is not the first command. This should never happen (unless the queue was purged and recreated within 30 seconds... unlikely.`,
                );
            }
        }, this.COMMAND_TIME_IN_QUEUE_MS);
    }
}

export const mapsManager = new MapsManager();
