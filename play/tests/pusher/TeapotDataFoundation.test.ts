// @vitest-environment node
/* eslint-disable @typescript-eslint/require-await -- synchronous test double implements the asynchronous secret-box contract */

import { describe, expect, it } from "vitest";

import {
    TeapotAuthorizationError,
    TeapotDataConflictError,
    TeapotMapWriterLeaseConflictError,
} from "../../src/pusher/teapot/TeapotDataErrors";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";

function createRepository() {
    let nextId = 0;
    let timestamp = Date.parse("2026-08-09T10:00:00.000Z");
    return {
        repository: new InMemoryTeapotDataRepository({
            createId: () => `record-${++nextId}`,
            now: () => new Date(timestamp),
        }),
        advanceTime: (milliseconds: number) => {
            timestamp += milliseconds;
        },
    };
}

describe("Teapot data foundation", () => {
    it("keeps owner-scoped styles idempotent and clones authoritative asset metadata", async () => {
        const { repository } = createRepository();
        const services = createTeapotDataServices(repository);
        const owner = await services.localIdentity.resolve({ localSubject: "style-owner" });
        const stranger = await services.localIdentity.resolve({ localSubject: "style-stranger" });
        const asset = await repository.createAsset({
            ownerId: owner.id,
            objectReference: "map-storage://assets/tree",
            kind: "map-entity",
            mediaType: "image/png",
            metadata: { name: "Oak", tags: ["tree", "forest"], width: 64, ownerId: "forged" },
        });

        const defaults = await repository.listMapStyles(owner.id);
        expect(defaults).toMatchObject([{ name: "Default", isDefault: true }]);
        expect(await repository.listMapStyleEntries(owner.id, defaults[0].id, "map-entity")).toHaveLength(1);

        const style = await repository.createMapStyle({
            ownerId: owner.id,
            name: " Watercolor  Village ",
            idempotencyKey: "create-1",
        });
        await expect(
            repository.createMapStyle({ ownerId: owner.id, name: "watercolor village", idempotencyKey: "create-2" }),
        ).rejects.toBeInstanceOf(TeapotDataConflictError);
        const first = await repository.copyMapStyleEntry({
            ownerId: owner.id,
            styleId: style.id,
            source: { type: "teapot-asset", assetId: asset.id, sourceVersion: 1 },
            idempotencyKey: "copy-1",
        });
        const replay = await repository.copyMapStyleEntry({
            ownerId: owner.id,
            styleId: style.id,
            source: { type: "teapot-asset", assetId: asset.id, sourceVersion: 1 },
            idempotencyKey: "copy-1",
        });
        expect(replay.id).toBe(first.id);
        expect(first.metadataSnapshot).toEqual({ name: "Oak", tags: ["tree", "forest"], width: 64 });
        await expect(
            repository.copyMapStyleEntry({
                ownerId: stranger.id,
                styleId: style.id,
                source: { type: "teapot-asset", assetId: asset.id, sourceVersion: 1 },
                idempotencyKey: "copy-foreign",
            }),
        ).rejects.toThrow("unavailable");
    });

    it("resolves one stable internal identity for a reloaded local subject", async () => {
        const { repository } = createRepository();
        const services = createTeapotDataServices(repository);

        const first = await services.localIdentity.resolve({
            localSubject: "local-browser-profile",
            displayName: "Priya",
            initialRoles: ["creator"],
        });
        const reloaded = await services.localIdentity.resolve({ localSubject: "local-browser-profile" });
        const context = await services.authorization.getIdentityContext(first.id);

        expect(reloaded.id).toBe(first.id);
        expect(context.roles).toEqual(["creator", "member"]);
        expect(context.capabilities).toContain("map.publish");
        expect(await repository.findProviderLink("local-development", "local-browser-profile")).toMatchObject({
            userId: first.id,
        });
    });

    it("rejects cross-user asset and catalog management", async () => {
        const { repository } = createRepository();
        const services = createTeapotDataServices(repository);
        const owner = await services.localIdentity.resolve({ localSubject: "owner" });
        const stranger = await services.localIdentity.resolve({ localSubject: "stranger" });
        const catalog = await repository.createCatalog({ ownerId: owner.id, kind: "woka", name: "My Wokas" });
        const asset = await repository.createAsset({
            ownerId: owner.id,
            objectReference: "map-storage://assets/sha256/avatar-owner",
            kind: "woka",
            mediaType: "image/png",
        });

        await expect(services.authorization.getAssetForManagement(stranger.id, asset.id)).rejects.toBeInstanceOf(
            TeapotAuthorizationError,
        );
        await expect(services.authorization.getCatalogForManagement(stranger.id, catalog.id)).rejects.toBeInstanceOf(
            TeapotAuthorizationError,
        );
        await expect(services.authorization.getAssetForManagement(owner.id, asset.id)).resolves.toEqual(asset);
    });

    it("serializes WAM and TMJ writers against one map revision", async () => {
        const { repository } = createRepository();
        const services = createTeapotDataServices(repository);
        const creator = await services.localIdentity.resolve({ localSubject: "creator", initialRoles: ["creator"] });

        const wamLease = await services.mapRevisions.acquire({
            actorId: creator.id,
            mapId: "https://maps.test/world.wam",
            expectedRevision: 0,
            source: "wam",
        });
        await expect(
            services.mapRevisions.acquire({
                actorId: creator.id,
                mapId: "https://maps.test/world.wam",
                expectedRevision: 0,
                source: "tmj",
            }),
        ).rejects.toBeInstanceOf(TeapotMapWriterLeaseConflictError);

        const firstRevision = await repository.commitMapWriterLease({
            mapId: wamLease.mapId,
            leaseToken: wamLease.leaseToken,
            writerId: creator.id,
            objectReference: "map-storage://maps/world/revision-1.wam",
        });
        const tmjMutation = await services.mapRevisions.execute(
            {
                actorId: creator.id,
                mapId: wamLease.mapId,
                expectedRevision: 1,
                source: "tmj",
            },
            async () => ({
                value: "published",
                objectReference: "map-storage://maps/world/revision-2.tmj",
            }),
        );

        expect(firstRevision.revision).toBe(1);
        expect(tmjMutation.revision).toMatchObject({
            revision: 2,
            lastObjectReference: "map-storage://maps/world/revision-2.tmj",
        });
    });

    it("exports and restores owned records without copying binary map or asset bytes", async () => {
        const source = createRepository().repository;
        const services = createTeapotDataServices(source);
        const owner = await services.localIdentity.resolve({ localSubject: "backup-owner", initialRoles: ["creator"] });
        const endorser = await services.localIdentity.resolve({ localSubject: "backup-endorser" });
        const catalog = await source.createCatalog({ ownerId: owner.id, kind: "map-entity", name: "Trees" });
        const asset = await source.createAsset({
            ownerId: owner.id,
            objectReference: "map-storage://assets/sha256/tree",
            kind: "map-entity",
            mediaType: "image/png",
            metadata: { interaction: "none" },
            published: true,
        });
        await source.addAssetToCatalog(catalog.id, asset.id, 0);
        await source.createMcpSession({
            ownerId: owner.id,
            clientName: "Codex",
            tokenHash: "a".repeat(64),
            expiresAt: "2026-08-09T11:00:00.000Z",
        });
        await source.createEndorsement({ candidateId: owner.id, endorserId: endorser.id, state: "accepted" });
        await source.appendAuditEvent({
            actorId: owner.id,
            action: "asset.created",
            objectType: "asset",
            objectId: asset.id,
        });

        const exported = await source.exportData();
        const restored = createRepository().repository;
        await restored.restoreData(exported);
        const restoredExport = await restored.exportData();

        expect(restoredExport.assets).toEqual(exported.assets);
        expect(restoredExport.catalogAssets).toEqual(exported.catalogAssets);
        expect(restoredExport.mcpSessions).toEqual(exported.mcpSessions);
        expect(restoredExport.endorsements).toEqual(exported.endorsements);
        expect(restoredExport.auditEvents).toEqual(exported.auditEvents);
        expect(restoredExport.assets[0]?.objectReference).toBe("map-storage://assets/sha256/tree");
    });
});
