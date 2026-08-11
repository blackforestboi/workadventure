// @vitest-environment node
/* eslint-disable @typescript-eslint/require-await -- synchronous test doubles implement asynchronous revision contracts */

import { describe, expect, it, vi } from "vitest";

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
    const coordinator = new TeapotWamRevisionCoordinator(
        { resolve: async () => "https://maps.test/world.tmj" },
        () => services,
        async () => identity,
    );
    return { coordinator, identity, repository, services };
}

describe("TeapotWamRevisionCoordinator", () => {
    it("holds the shared map lease until the durable WAM acknowledgement", async () => {
        const { coordinator, identity, repository, services } = await setup();

        await coordinator.begin({
            commandId: "command-1",
            roomId: "https://play.test/~/world.wam",
            actorIdentifier: identity.id,
            legacyCanEdit: true,
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

    it("queues rapid WAM commands instead of rejecting normal editor bursts", async () => {
        const { coordinator, identity, repository } = await setup();
        const roomId = "https://play.test/~/world.wam";

        await coordinator.begin({ commandId: "command-1", roomId, actorIdentifier: identity.id, legacyCanEdit: true });
        const secondBegin = coordinator.begin({
            commandId: "command-2",
            roomId,
            actorIdentifier: identity.id,
            legacyCanEdit: true,
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
            }),
        ).resolves.toBe(false);
    });

    it("exposes settings to current admins without granting map mutations", async () => {
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
            }),
        ).resolves.toBe(true);
        await expect(
            coordinator.begin({
                commandId: "admin-content-edit",
                roomId: "https://play.test/~/world.wam",
                actorIdentifier: identity.id,
                legacyCanEdit: false,
            }),
        ).rejects.toBeInstanceOf(TeapotAuthorizationError);
    });
});
