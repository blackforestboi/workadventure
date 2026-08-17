// @vitest-environment node
/* eslint-disable @typescript-eslint/require-await -- synchronous test doubles implement asynchronous revision contracts */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => import("./mocks/pusherEnvironmentVariableMock"));

import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { TeapotAuthorizationError, TeapotMapWriterLeaseConflictError } from "../../src/pusher/teapot/TeapotDataErrors";
import { TeapotWamRevisionCoordinator } from "../../src/pusher/teapot/TeapotWamRevisionCoordinator";

async function setup() {
    let nextId = 0;
    const repository = new InMemoryTeapotDataRepository({ createId: () => `record-${++nextId}` });
    const services = createTeapotDataServices(repository);
    const identity = await services.localIdentity.resolve({
        localSubject: "creator",
        initialRoles: ["creator"],
    });
    const identityResolver = vi.fn(async () => identity);
    const coordinator = new TeapotWamRevisionCoordinator(
        { resolve: async () => "https://maps.test/world.tmj" },
        () => services,
        identityResolver,
    );
    return { coordinator, identity, identityResolver, repository, services };
}

describe("TeapotWamRevisionCoordinator", () => {
    afterEach(() => vi.useRealTimers());

    it("allows a guest temporary root-room access even when the durable policy is locked", async () => {
        const { coordinator, identity, identityResolver, repository } = await setup();
        await repository.replaceRoomEditorPolicy({
            mapId: "https://maps.test/world.tmj",
            mode: "nobody",
            expectedVersion: null,
            editorIds: [],
            actorId: identity.id,
        });
        const join = {
            roomId: "https://play.test/~/world.wam",
            actorIdentifier: identity.id,
            legacyCanEdit: false,
            managementUiAccess: false,
            temporaryRootEditor: true,
            isLogged: false,
        };

        await expect(coordinator.resolveJoinAccess(join)).resolves.toMatchObject({ canEdit: true });
        expect(identityResolver).toHaveBeenCalledWith(identity.id, true);
        await expect(
            coordinator.begin({
                commandId: "guest-command",
                roomId: join.roomId,
                actorIdentifier: identity.id,
                legacyCanEdit: false,
                temporaryRootEditor: true,
                isLogged: false,
            }),
        ).resolves.toBeUndefined();
        await coordinator.acknowledgeFailure("guest-command");
    });

    it("separates signed-in access from ordinary guest eligibility under restrictive policy", async () => {
        const { coordinator, identity, identityResolver, repository } = await setup();
        await repository.replaceRoomEditorPolicy({
            mapId: "https://maps.test/world.tmj",
            mode: "nobody",
            expectedVersion: null,
            editorIds: [],
            actorId: identity.id,
        });

        const signedInJoin = {
            roomId: "https://play.test/~/world.wam",
            actorIdentifier: identity.id,
            legacyCanEdit: false,
            managementUiAccess: false,
            isLogged: true,
        };
        await expect(coordinator.resolveJoinAccess(signedInJoin)).resolves.toMatchObject({ canEdit: true });
        await expect(
            coordinator.begin({
                commandId: "signed-in-command",
                roomId: signedInJoin.roomId,
                actorIdentifier: identity.id,
                legacyCanEdit: false,
                isLogged: true,
            }),
        ).resolves.toBeUndefined();
        await coordinator.acknowledgeFailure("signed-in-command");

        await expect(
            coordinator.resolveJoinAccess({
                ...signedInJoin,
                isLogged: false,
            }),
        ).resolves.toMatchObject({ canEdit: false });
        expect(identityResolver).toHaveBeenLastCalledWith(identity.id, false);
        await expect(
            coordinator.begin({
                commandId: "ordinary-guest-command",
                roomId: signedInJoin.roomId,
                actorIdentifier: identity.id,
                legacyCanEdit: false,
                isLogged: false,
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
    });

    it("holds the shared map lease until the durable WAM acknowledgement", async () => {
        const { coordinator, identity, repository, services } = await setup();

        await coordinator.begin({
            commandId: "command-1",
            roomId: "https://play.test/~/world.wam",
            actorIdentifier: identity.id,
            legacyCanEdit: true,
            isLogged: true,
        });
        await expect(
            services.mapRevisions.acquire({
                actorId: identity.id,
                mapId: "https://maps.test/world.tmj",
                expectedRevision: 0,
                source: "tmj",
            }),
        ).rejects.toBeInstanceOf(TeapotMapWriterLeaseConflictError);

        await coordinator.acknowledgeSuccess("command-1");

        await expect(repository.getMapRevision("https://maps.test/world.tmj")).resolves.toMatchObject({
            revision: 1,
            lastObjectReference: "wam-command:command-1",
        });
    });

    it("releases a rejected WAM command without advancing the revision", async () => {
        const { coordinator, identity, repository, services } = await setup();

        await coordinator.begin({
            commandId: "command-rejected",
            roomId: "https://play.test/~/world.wam",
            actorIdentifier: identity.id,
            legacyCanEdit: true,
            isLogged: true,
        });
        await coordinator.acknowledgeFailure("command-rejected");

        expect((await repository.getMapRevision("https://maps.test/world.tmj")).revision).toBe(0);
        await expect(
            services.mapRevisions.acquire({
                actorId: identity.id,
                mapId: "https://maps.test/world.tmj",
                expectedRevision: 0,
                source: "tmj",
            }),
        ).resolves.toMatchObject({ mapId: "https://maps.test/world.tmj" });
    });

    it("rejects a success acknowledgement after its revision lease has already timed out", async () => {
        vi.useFakeTimers();
        const { coordinator, identity } = await setup();

        await coordinator.begin({
            commandId: "late-command",
            roomId: "https://play.test/~/world.wam",
            actorIdentifier: identity.id,
            legacyCanEdit: true,
            isLogged: false,
        });
        await vi.advanceTimersToNextTimerAsync();

        await expect(coordinator.acknowledgeSuccess("late-command")).rejects.toThrow("no active revision lease");
    });

    it("queues rapid WAM commands instead of rejecting normal editor bursts", async () => {
        const { coordinator, identity, repository } = await setup();
        const roomId = "https://play.test/~/world.wam";

        await coordinator.begin({
            commandId: "command-1",
            roomId,
            actorIdentifier: identity.id,
            legacyCanEdit: true,
            isLogged: true,
        });
        const secondBegin = coordinator.begin({
            commandId: "command-2",
            roomId,
            actorIdentifier: identity.id,
            legacyCanEdit: true,
            isLogged: true,
        });
        let secondStarted = false;
        secondBegin
            .then(() => {
                secondStarted = true;
            })
            .catch(() => undefined);
        await Promise.resolve();
        expect(secondStarted).toBe(false);

        await coordinator.acknowledgeSuccess("command-1");
        await secondBegin;
        await coordinator.acknowledgeSuccess("command-2");

        expect((await repository.getMapRevision("https://maps.test/world.tmj")).revision).toBe(2);
    });

    it("fails closed for editor controls when join canonicalization fails", async () => {
        const { identity, services } = await setup();
        const coordinator = new TeapotWamRevisionCoordinator(
            { resolve: async () => Promise.reject(new Error("map unavailable")) },
            () => services,
            async () => identity,
        );

        await expect(
            coordinator.resolveJoinCanEdit({
                roomId: "https://play.test/~/missing.wam",
                actorIdentifier: identity.id,
                legacyCanEdit: true,
                managementUiAccess: true,
                isLogged: true,
            }),
        ).resolves.toBe(false);
    });

    it("treats the immutable room admin as an effective admin, editor, and viewer", async () => {
        const { coordinator, identity, repository } = await setup();
        await repository.replaceRoomEditorPolicy({
            mapId: "https://maps.test/world.tmj",
            mode: "nobody",
            expectedVersion: null,
            editorIds: [],
            actorId: identity.id,
        });

        await expect(
            coordinator.resolveJoinCanEdit({
                roomId: "https://play.test/~/world.wam",
                actorIdentifier: identity.id,
                legacyCanEdit: false,
                managementUiAccess: true,
                isLogged: true,
            }),
        ).resolves.toBe(true);
        await expect(
            coordinator.begin({
                commandId: "admin-content-edit",
                roomId: "https://play.test/~/world.wam",
                actorIdentifier: identity.id,
                legacyCanEdit: false,
                legacyCanAdmin: true,
                isLogged: true,
            }),
        ).resolves.toBeUndefined();
        await coordinator.acknowledgeFailure("admin-content-edit");
    });

    it("denies unauthorized viewers before admission and records every successful visit", async () => {
        const { coordinator, identity, repository } = await setup();
        await repository.replaceRoomAccessPolicy({
            mapId: "https://maps.test/world.tmj",
            role: "view",
            mode: "nobody",
            expectedVersion: null,
            memberIds: [],
            actorId: identity.id,
        });
        const join = {
            roomId: "https://play.test/~/world.wam",
            actorIdentifier: identity.id,
            legacyCanEdit: false,
            managementUiAccess: false,
            isLogged: true,
        };
        await expect(coordinator.resolveJoinAccess(join)).rejects.toBeInstanceOf(TeapotAuthorizationError);
        await expect(repository.listRoomVisitors("https://maps.test/world.tmj")).resolves.toEqual([]);

        await repository.replaceRoomAccessPolicy({
            mapId: "https://maps.test/world.tmj",
            role: "view",
            mode: "specific",
            expectedVersion: 1,
            memberIds: [identity.id],
            actorId: identity.id,
        });
        await expect(coordinator.resolveJoinAccess(join)).resolves.toMatchObject({
            canView: true,
            canEdit: true,
            canAdmin: false,
        });
        await coordinator.resolveJoinAccess(join);
        await expect(repository.listRoomVisitors("https://maps.test/world.tmj")).resolves.toEqual([
            expect.objectContaining({ userId: identity.id, visitCount: 2 }),
        ]);
    });
});
