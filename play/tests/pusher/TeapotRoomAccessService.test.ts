// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { TeapotAuthorizationError } from "../../src/pusher/teapot/TeapotDataErrors";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";

const MAP_ID = "https://maps.test/world.tmj";

async function setup() {
    let nextId = 0;
    const repository = new InMemoryTeapotDataRepository({ createId: () => `record-${++nextId}` });
    const services = createTeapotDataServices(repository);
    const creator = await services.localIdentity.resolve({ localSubject: "creator", initialRoles: ["creator"] });
    const member = await services.localIdentity.resolve({ localSubject: "member" });
    const operator = await services.localIdentity.resolve({ localSubject: "operator", initialRoles: ["operator"] });
    return { repository, services, creator, member, operator };
}

describe("TeapotRoomAccessService", () => {
    it("uses legacy WAM access and direct capabilities while a policy is absent", async () => {
        const { services, creator, member } = await setup();

        await expect(
            services.roomAccess.assertCanEdit({
                actorId: member.id,
                mapId: MAP_ID,
                context: { kind: "wam", successfulJoin: true, legacyCanEdit: true },
            }),
        ).resolves.toBeUndefined();
        await expect(
            services.roomAccess.assertCanEdit({
                actorId: member.id,
                mapId: MAP_ID,
                context: { kind: "wam", successfulJoin: true, legacyCanEdit: false },
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
        await expect(
            services.roomAccess.assertCanEdit({
                actorId: creator.id,
                mapId: MAP_ID,
                context: { kind: "direct", requiredCapability: "map.edit" },
            }),
        ).resolves.toBeUndefined();
        await expect(
            services.roomAccess.assertCanEdit({
                actorId: member.id,
                mapId: MAP_ID,
                context: { kind: "direct", requiredCapability: "map.edit" },
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
    });

    it("applies everyone only to joined WAM users and globally authorized direct users", async () => {
        const { repository, services, creator, member } = await setup();
        await repository.replaceRoomEditorPolicy({
            mapId: MAP_ID,
            mode: "everyone",
            expectedVersion: null,
            editorIds: [],
            actorId: creator.id,
        });

        await expect(
            services.roomAccess.assertCanEdit({
                actorId: member.id,
                mapId: MAP_ID,
                context: { kind: "wam", successfulJoin: true, legacyCanEdit: false },
            }),
        ).resolves.toBeUndefined();
        await expect(
            services.roomAccess.assertCanEdit({
                actorId: member.id,
                mapId: MAP_ID,
                context: { kind: "direct", requiredCapability: "map.edit" },
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
        await expect(
            services.roomAccess.assertCanEdit({
                actorId: creator.id,
                mapId: MAP_ID,
                context: { kind: "direct", requiredCapability: "map.edit" },
            }),
        ).resolves.toBeUndefined();
    });

    it("requires an explicit grant in specific mode", async () => {
        const { repository, services, creator, member } = await setup();
        await repository.replaceRoomEditorPolicy({
            mapId: MAP_ID,
            mode: "specific",
            expectedVersion: null,
            editorIds: [member.id],
            actorId: creator.id,
        });

        await expect(
            services.roomAccess.assertCanEdit({
                actorId: member.id,
                mapId: MAP_ID,
                context: { kind: "wam", successfulJoin: true, legacyCanEdit: false },
            }),
        ).resolves.toBeUndefined();
        await expect(
            services.roomAccess.assertCanEdit({
                actorId: creator.id,
                mapId: MAP_ID,
                context: { kind: "wam", successfulJoin: true, legacyCanEdit: true },
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
    });

    it("re-checks the current policy before each revision lease", async () => {
        const { repository, services, creator, member } = await setup();
        const created = await repository.replaceRoomEditorPolicy({
            mapId: MAP_ID,
            mode: "specific",
            expectedVersion: null,
            editorIds: [member.id],
            actorId: creator.id,
        });
        const editContext = { kind: "wam", successfulJoin: true, legacyCanEdit: false } as const;
        const lease = await services.mapRevisions.acquire({
            actorId: member.id,
            mapId: MAP_ID,
            expectedRevision: 0,
            source: "wam",
            editContext,
        });
        await repository.releaseMapWriterLease(MAP_ID, lease.leaseToken, member.id);
        await repository.replaceRoomEditorPolicy({
            mapId: MAP_ID,
            mode: "nobody",
            expectedVersion: created.policy.version,
            editorIds: [member.id],
            actorId: creator.id,
        });

        await expect(
            services.mapRevisions.acquire({
                actorId: member.id,
                mapId: MAP_ID,
                expectedRevision: 0,
                source: "wam",
                editContext,
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
    });

    it("denies ordinary users in nobody mode but preserves the recovery override", async () => {
        const { repository, services, creator, operator } = await setup();
        await repository.replaceRoomEditorPolicy({
            mapId: MAP_ID,
            mode: "nobody",
            expectedVersion: null,
            editorIds: [],
            actorId: creator.id,
        });

        await expect(
            services.roomAccess.assertCanEdit({
                actorId: creator.id,
                mapId: MAP_ID,
                context: { kind: "wam", successfulJoin: true, legacyCanEdit: true },
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
        await expect(
            services.roomAccess.assertCanEdit({
                actorId: operator.id,
                mapId: MAP_ID,
                context: { kind: "direct", requiredCapability: "map.publish" },
            }),
        ).resolves.toBeUndefined();
    });

    it("denies suspended identities before the recovery override", async () => {
        const { repository, services, operator } = await setup();
        await repository.updateAdmissionState(operator.id, "suspended");

        await expect(
            services.roomAccess.assertCanEdit({
                actorId: operator.id,
                mapId: MAP_ID,
                context: { kind: "direct", requiredCapability: "map.publish" },
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
    });
});
