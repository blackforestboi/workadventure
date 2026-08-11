import { describe, expect, it } from "vitest";
import { TeapotDataConflictError, TeapotDataNotFoundError } from "../../src/pusher/teapot/TeapotDataErrors";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";

function createFixture() {
    let nextId = 0;
    const repository = new InMemoryTeapotDataRepository({
        createId: () => `record-${++nextId}`,
        now: () => new Date("2026-08-11T00:00:00.000Z"),
    });
    return { repository };
}

async function createIdentity(repository: InMemoryTeapotDataRepository, subject: string) {
    return repository.resolveIdentity({ provider: "test", providerSubject: subject, displayName: subject });
}

describe("room editor policy repository", () => {
    it("stores one versioned policy and deduplicated explicit grants per map", async () => {
        const { repository } = createFixture();
        const actor = await createIdentity(repository, "admin");
        const editor = await createIdentity(repository, "editor");

        await expect(repository.getRoomEditorPolicy("https://maps.test/room.tmj")).resolves.toBeNull();
        await expect(repository.listRoomEditorGrants("https://maps.test/room.tmj")).resolves.toEqual([]);

        const created = await repository.replaceRoomEditorPolicy({
            mapId: "https://maps.test/room.tmj",
            mode: "specific",
            expectedVersion: null,
            editorIds: [editor.id, editor.id],
            actorId: actor.id,
        });

        expect(created.policy).toMatchObject({
            mapId: "https://maps.test/room.tmj",
            mode: "specific",
            version: 1,
            updatedBy: actor.id,
        });
        expect(created.grants).toEqual([
            {
                mapId: "https://maps.test/room.tmj",
                role: "edit",
                userId: editor.id,
                grantedBy: actor.id,
                createdAt: "2026-08-11T00:00:00.000Z",
            },
        ]);
        await expect(repository.listRoomEditorGrants("https://maps.test/room.tmj")).resolves.toEqual(created.grants);
    });

    it("atomically replaces mode and grants only at the expected version", async () => {
        const { repository } = createFixture();
        const actor = await createIdentity(repository, "admin");
        const firstEditor = await createIdentity(repository, "first-editor");
        const secondEditor = await createIdentity(repository, "second-editor");
        const mapId = "https://maps.test/room.tmj";

        await repository.replaceRoomEditorPolicy({
            mapId,
            mode: "specific",
            expectedVersion: null,
            editorIds: [firstEditor.id],
            actorId: actor.id,
        });
        const replaced = await repository.replaceRoomEditorPolicy({
            mapId,
            mode: "nobody",
            expectedVersion: 1,
            editorIds: [secondEditor.id],
            actorId: actor.id,
        });

        expect(replaced.policy).toMatchObject({ mode: "nobody", version: 2 });
        expect(replaced.grants.map((grant) => grant.userId)).toEqual([secondEditor.id]);

        await expect(
            repository.replaceRoomEditorPolicy({
                mapId,
                mode: "everyone",
                expectedVersion: 1,
                editorIds: [],
                actorId: actor.id,
            }),
        ).rejects.toBeInstanceOf(TeapotDataConflictError);
        await expect(repository.getRoomEditorPolicy(mapId)).resolves.toMatchObject({ mode: "nobody", version: 2 });
        await expect(repository.listRoomEditorGrants(mapId)).resolves.toEqual(replaced.grants);
    });

    it("rejects grants for identities outside the Teapot identity boundary", async () => {
        const { repository } = createFixture();
        const actor = await createIdentity(repository, "admin");
        const mapId = "https://maps.test/room.tmj";

        await expect(
            repository.replaceRoomEditorPolicy({
                mapId,
                mode: "specific",
                expectedVersion: null,
                editorIds: ["missing-user"],
                actorId: actor.id,
            }),
        ).rejects.toBeInstanceOf(TeapotDataNotFoundError);
        await expect(repository.getRoomEditorPolicy(mapId)).resolves.toBeNull();
    });

    it("keeps policies independent across canonical map IDs", async () => {
        const { repository } = createFixture();
        const actor = await createIdentity(repository, "admin");

        await repository.replaceRoomEditorPolicy({
            mapId: "https://maps.test/room-a.tmj",
            mode: "everyone",
            expectedVersion: null,
            editorIds: [],
            actorId: actor.id,
        });
        await repository.replaceRoomEditorPolicy({
            mapId: "https://maps.test/room-b.tmj",
            mode: "nobody",
            expectedVersion: null,
            editorIds: [],
            actorId: actor.id,
        });

        await expect(repository.getRoomEditorPolicy("https://maps.test/room-a.tmj")).resolves.toMatchObject({
            mode: "everyone",
        });
        await expect(repository.getRoomEditorPolicy("https://maps.test/room-b.tmj")).resolves.toMatchObject({
            mode: "nobody",
        });
    });

    it("exports policies in schema 4 and restores schema 2 exports without them", async () => {
        const { repository } = createFixture();
        const actor = await createIdentity(repository, "admin");
        const editor = await createIdentity(repository, "editor");
        const mapId = "https://maps.test/room.tmj";
        await repository.replaceRoomEditorPolicy({
            mapId,
            mode: "specific",
            expectedVersion: null,
            editorIds: [editor.id],
            actorId: actor.id,
        });

        const exported = await repository.exportData();
        expect(exported.schemaVersion).toBe(4);
        expect(exported.roomAccessPolicies).toHaveLength(1);
        expect(exported.roomAccessGrants).toHaveLength(1);

        const restored = new InMemoryTeapotDataRepository();
        await restored.restoreData(exported);
        await expect(restored.getRoomEditorPolicy(mapId)).resolves.toMatchObject({ mode: "specific", version: 1 });
        await expect(restored.listRoomEditorGrants(mapId)).resolves.toHaveLength(1);

        const legacyFields = structuredClone(exported);
        delete legacyFields.roomAccessPolicies;
        delete legacyFields.roomAccessGrants;
        delete legacyFields.roomVisitors;
        const legacyRestored = new InMemoryTeapotDataRepository();
        await legacyRestored.restoreData({ ...legacyFields, schemaVersion: 2 });
        await expect(legacyRestored.getRoomEditorPolicy(mapId)).resolves.toBeNull();
    });

    it("stores independent role policies and the complete visitor history", async () => {
        const { repository } = createFixture();
        const actor = await createIdentity(repository, "admin");
        const visitor = await createIdentity(repository, "visitor");
        const mapId = "https://maps.test/room.tmj";

        await repository.replaceRoomAccessPolicy({
            mapId,
            role: "view",
            mode: "specific",
            expectedVersion: null,
            memberIds: [visitor.id],
            actorId: actor.id,
        });
        await repository.replaceRoomAccessPolicy({
            mapId,
            role: "admin",
            mode: "nobody",
            expectedVersion: null,
            memberIds: [],
            actorId: actor.id,
        });
        await repository.recordRoomVisit(mapId, visitor.id);
        await repository.recordRoomVisit(mapId, visitor.id);

        await expect(repository.getRoomAccessPolicy(mapId, "view")).resolves.toMatchObject({
            role: "view",
            mode: "specific",
        });
        await expect(repository.getRoomAccessPolicy(mapId, "edit")).resolves.toBeNull();
        await expect(repository.getRoomAccessPolicy(mapId, "admin")).resolves.toMatchObject({
            role: "admin",
            mode: "nobody",
        });
        await expect(repository.listRoomAccessGrants(mapId, "view")).resolves.toHaveLength(1);
        await expect(repository.listRoomVisitors(mapId)).resolves.toEqual([
            expect.objectContaining({ mapId, userId: visitor.id, visitCount: 2 }),
        ]);

        const exported = await repository.exportData();
        const restored = new InMemoryTeapotDataRepository();
        await restored.restoreData(exported);
        await expect(restored.listRoomVisitors(mapId)).resolves.toEqual([
            expect.objectContaining({ mapId, userId: visitor.id, visitCount: 2 }),
        ]);
    });
});
