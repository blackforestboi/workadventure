import { z } from "zod";

import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import { adminService } from "../services/AdminService";
import type { TeapotDataServices } from "./createTeapotDataServices";
import { getTeapotDataServices } from "./TeapotDataRuntime";
import { TeapotAuthorizationError } from "./TeapotDataErrors";
import { resolveTeapotRequestIdentity } from "./TeapotRequestIdentityResolver";
import type { TeapotMapWriterLease } from "./TeapotRecords";

const WamMapReference = z.object({ mapUrl: z.string().min(1) }).passthrough();
const TeapotMapDetails = z
    .object({ mapUrl: z.string().min(1).optional(), wamUrl: z.string().min(1).optional() })
    .passthrough();
const TeapotMapError = z.object({ details: z.string().optional(), title: z.string().optional() }).passthrough();
const COMMAND_TIMEOUT_MS = 25_000;

interface PendingWamMutation {
    commandId: string;
    roomId: string;
    mapId: string;
    actorId: string;
    actorIdentifier: string;
    leaseToken: string;
    timeout: ReturnType<typeof setTimeout>;
    queueTail: Promise<void>;
    releaseQueue: () => void;
}

export interface BeginWamMutationInput {
    commandId: string;
    roomId: string;
    actorIdentifier: string;
    authToken?: string;
    legacyCanEdit: boolean;
    legacyCanAdmin?: boolean;
    isLogged?: boolean;
}

export interface ResolveWamJoinAccessInput {
    roomId: string;
    actorIdentifier: string;
    authToken?: string;
    legacyCanEdit: boolean;
    managementUiAccess: boolean;
    isLogged?: boolean;
}

export interface ResolvedWamJoinAccess {
    mapId: string;
    actorId: string;
    canView: boolean;
    canEdit: boolean;
    canAdmin: boolean;
}

export interface TeapotMapUrlResolver {
    resolve(roomId: string, authToken?: string): Promise<string>;
}

/** Resolves the public play-room URL to the authoritative TMJ referenced by its WAM. */
export class AdminTeapotMapUrlResolver implements TeapotMapUrlResolver {
    private readonly cache = new Map<string, Promise<string>>();

    public resolve(roomId: string, authToken?: string): Promise<string> {
        const existing = this.cache.get(roomId);
        if (existing !== undefined) return existing;

        const pending = this.resolveUncached(roomId, authToken).catch((error: unknown) => {
            this.cache.delete(roomId);
            throw error;
        });
        this.cache.set(roomId, pending);
        return pending;
    }

    private async resolveUncached(roomId: string, authToken?: string): Promise<string> {
        const details = await adminService.fetchMapDetails(roomId, authToken);
        if ("redirectUrl" in details) {
            return this.resolve(details.redirectUrl, authToken);
        }
        if ("status" in details && details.status === "error") {
            const errorDetails = TeapotMapError.parse(details);
            throw new Error(errorDetails.details || errorDetails.title || "The room map could not be resolved");
        }
        const mapDetails = TeapotMapDetails.parse(details);
        if (mapDetails.mapUrl) return new URL(mapDetails.mapUrl).toString();
        if (!mapDetails.wamUrl) throw new Error("The room has neither a TMJ nor a WAM URL");

        const response = await fetch(mapDetails.wamUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`The room WAM could not be read (${response.status})`);
        const parsed = WamMapReference.safeParse(await response.json());
        if (!parsed.success) throw new Error("The room WAM does not reference a valid TMJ");
        return new URL(parsed.data.mapUrl, mapDetails.wamUrl).toString();
    }
}

/**
 * Bridges WorkAdventure's existing command ACKs into Teapot's single WAM/TMJ/MCP
 * revision authority. A command owns the lease until its durable ACK or error is
 * observed; the browser therefore never receives success before the revision commit.
 */
export class TeapotWamRevisionCoordinator {
    private readonly pending = new Map<string, PendingWamMutation>();
    private readonly finalizations = new Map<string, Promise<void>>();
    private readonly mapQueues = new Map<string, Promise<void>>();

    public constructor(
        private readonly mapUrlResolver: TeapotMapUrlResolver = new AdminTeapotMapUrlResolver(),
        private readonly services: () => TeapotDataServices = getTeapotDataServices,
        private readonly identityResolver: (
            identifier: string,
            grantDefaultCreatorRole?: boolean,
        ) => Promise<TeapotIdentity> = (identifier, grantDefaultCreatorRole) =>
            resolveTeapotRequestIdentity(identifier, undefined, grantDefaultCreatorRole),
    ) {}

    public async resolveJoinCanEdit(input: ResolveWamJoinAccessInput): Promise<boolean> {
        try {
            return (await this.resolveJoinAccess(input)).canEdit;
        } catch {
            return false;
        }
    }

    public async resolveJoinAccess(input: ResolveWamJoinAccessInput): Promise<ResolvedWamJoinAccess> {
        if (input.actorIdentifier.trim().length === 0) {
            throw new TeapotAuthorizationError("Room access requires a stable user identity");
        }
        const isLogged = input.isLogged !== false;
        const [mapId, identity] = await Promise.all([
            this.mapUrlResolver.resolve(input.roomId, input.authToken),
            this.identityResolver(input.actorIdentifier, isLogged),
        ]);
        const dataServices = this.services();
        const joinAccess = {
            actorId: identity.id,
            mapId,
            successfulJoin: true,
            legacyCanEdit: input.legacyCanEdit,
            legacyCanAdmin: input.managementUiAccess,
        };
        await dataServices.roomAccess.assertCanView(joinAccess);
        const [canEdit, canAdmin] = await Promise.all([
            isLogged
                ? this.isAllowed(() =>
                      dataServices.roomAccess.assertCanEdit({
                          actorId: identity.id,
                          mapId,
                          context: {
                              kind: "wam",
                              successfulJoin: true,
                              legacyCanEdit: input.legacyCanEdit,
                              legacyCanAdmin: input.managementUiAccess,
                              isLogged,
                          },
                      }),
                  )
                : Promise.resolve(false),
            this.isAllowed(() =>
                dataServices.roomAccess.assertCanAdmin({
                    actorId: identity.id,
                    mapId,
                    successfulJoin: true,
                    legacyCanAdmin: input.managementUiAccess,
                }),
            ),
        ]);
        await dataServices.repository.recordRoomVisit(mapId, identity.id);
        return { mapId, actorId: identity.id, canView: true, canEdit, canAdmin };
    }

    public async begin(input: BeginWamMutationInput): Promise<void> {
        if (input.commandId.trim().length === 0) throw new Error("Map commands require a command ID");
        if (input.isLogged === false) throw new TeapotAuthorizationError("Map editing requires login");
        const duplicate = this.pending.get(input.commandId);
        if (duplicate !== undefined) {
            if (duplicate.roomId !== input.roomId || duplicate.actorIdentifier !== input.actorIdentifier) {
                throw new Error("The map command ID is already in use");
            }
            return;
        }

        const [identity, mapId] = await Promise.all([
            this.identityResolver(input.actorIdentifier, true),
            this.mapUrlResolver.resolve(input.roomId, input.authToken),
        ]);
        const previous = this.mapQueues.get(mapId) ?? Promise.resolve();
        let releaseQueue: () => void = () => undefined;
        const queueSlot = new Promise<void>((resolve) => {
            releaseQueue = resolve;
        });
        const queueTail = previous.then(() => queueSlot);
        this.mapQueues.set(mapId, queueTail);
        await previous;

        let lease: TeapotMapWriterLease;
        try {
            const dataServices = this.services();
            const current = await dataServices.repository.getMapRevision(mapId);
            lease = await dataServices.mapRevisions.acquire({
                actorId: identity.id,
                mapId,
                expectedRevision: current.revision,
                source: "wam",
                leaseTtlMs: COMMAND_TIMEOUT_MS + 5_000,
                editContext: {
                    kind: "wam",
                    successfulJoin: true,
                    legacyCanEdit: input.legacyCanEdit,
                    legacyCanAdmin: input.legacyCanAdmin,
                    isLogged: input.isLogged,
                },
            });
        } catch (error: unknown) {
            releaseQueue();
            if (this.mapQueues.get(mapId) === queueTail) this.mapQueues.delete(mapId);
            throw error;
        }
        const timeout = setTimeout(() => {
            this.acknowledgeFailure(input.commandId).catch(() => undefined);
        }, COMMAND_TIMEOUT_MS);
        timeout.unref?.();
        this.pending.set(input.commandId, {
            commandId: input.commandId,
            roomId: input.roomId,
            mapId,
            actorId: identity.id,
            actorIdentifier: input.actorIdentifier,
            leaseToken: lease.leaseToken,
            timeout,
            queueTail,
            releaseQueue,
        });
    }

    private async isAllowed(check: () => Promise<void>): Promise<boolean> {
        try {
            await check();
            return true;
        } catch (error: unknown) {
            if (error instanceof TeapotAuthorizationError) return false;
            throw error;
        }
    }

    public acknowledgeSuccess(commandId: string): Promise<void> {
        return this.finalize(commandId, true);
    }

    public acknowledgeFailure(commandId: string): Promise<void> {
        return this.finalize(commandId, false);
    }

    public async releaseRoom(roomId: string): Promise<void> {
        const releases = [...this.pending.values()]
            .filter((entry) => entry.roomId === roomId)
            .map((entry) => this.acknowledgeFailure(entry.commandId));
        await Promise.allSettled(releases);
    }

    private finalize(commandId: string, succeeded: boolean): Promise<void> {
        const activeFinalization = this.finalizations.get(commandId);
        if (activeFinalization !== undefined) return activeFinalization;

        const entry = this.pending.get(commandId);
        if (entry === undefined) return Promise.resolve();
        this.pending.delete(commandId);
        clearTimeout(entry.timeout);

        const repository = this.services().repository;
        const operation = succeeded
            ? repository
                  .commitMapWriterLease({
                      mapId: entry.mapId,
                      leaseToken: entry.leaseToken,
                      writerId: entry.actorId,
                      objectReference: `wam-command:${entry.commandId}`,
                  })
                  .then(() => undefined)
                  .catch(async (error: unknown) => {
                      await repository
                          .releaseMapWriterLease(entry.mapId, entry.leaseToken, entry.actorId)
                          .catch(() => undefined);
                      throw error;
                  })
            : repository.releaseMapWriterLease(entry.mapId, entry.leaseToken, entry.actorId);

        const tracked = operation.finally(() => {
            entry.releaseQueue();
            if (this.mapQueues.get(entry.mapId) === entry.queueTail) this.mapQueues.delete(entry.mapId);
            this.finalizations.delete(commandId);
        });
        this.finalizations.set(commandId, tracked);
        return tracked;
    }
}

export const teapotWamRevisionCoordinator = new TeapotWamRevisionCoordinator();
