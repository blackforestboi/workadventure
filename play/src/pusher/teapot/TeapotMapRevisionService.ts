import type { TeapotCapability } from "../../common/Teapot/TeapotIdentity";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import type { TeapotMapMutationSource, TeapotMapRevisionRecord, TeapotMapWriterLease } from "./TeapotRecords";
import type { TeapotRoomAccessService, TeapotRoomEditContext } from "./TeapotRoomAccessService";

export interface TeapotMapMutationInput {
    actorId: string;
    mapId: string;
    expectedRevision: number;
    source: TeapotMapMutationSource;
    leaseTtlMs?: number;
    requiredCapability?: TeapotCapability;
    editContext?: TeapotRoomEditContext;
}

export interface TeapotMapMutationResult<T> {
    value: T;
    objectReference?: string;
}

export interface TeapotCommittedMapMutation<T> {
    value: T;
    revision: TeapotMapRevisionRecord;
}

/** Serializes WAM, TMJ, and MCP publications against one monotonic map revision. */
export class TeapotMapRevisionService {
    constructor(
        private readonly repository: TeapotDataRepository,
        private readonly roomAccess: TeapotRoomAccessService,
    ) {}

    async acquire(input: TeapotMapMutationInput): Promise<TeapotMapWriterLease> {
        await this.roomAccess.assertCanEdit({
            actorId: input.actorId,
            mapId: input.mapId,
            context: input.editContext ?? {
                kind: "direct",
                requiredCapability: input.requiredCapability ?? "map.edit",
            },
        });
        return this.repository.acquireMapWriterLease({
            mapId: input.mapId,
            writerId: input.actorId,
            expectedRevision: input.expectedRevision,
            source: input.source,
            ttlMs: input.leaseTtlMs ?? 30_000,
        });
    }

    async execute<T>(
        input: TeapotMapMutationInput,
        mutate: (lease: TeapotMapWriterLease) => Promise<TeapotMapMutationResult<T>>,
    ): Promise<TeapotCommittedMapMutation<T>> {
        const lease = await this.acquire(input);
        try {
            const result = await mutate(lease);
            const revision = await this.repository.commitMapWriterLease({
                mapId: input.mapId,
                leaseToken: lease.leaseToken,
                writerId: input.actorId,
                objectReference: result.objectReference,
            });
            return { value: result.value, revision };
        } catch (error: unknown) {
            await this.repository.releaseMapWriterLease(input.mapId, lease.leaseToken, input.actorId);
            throw error;
        }
    }
}
