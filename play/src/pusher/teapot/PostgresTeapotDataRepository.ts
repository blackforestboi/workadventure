/* eslint-disable no-await-in-loop -- restore operations are intentionally ordered inside one transaction */

import { randomUUID } from "node:crypto";

import type {
    TeapotAdmissionState,
    TeapotCapability,
    TeapotIdentity,
    TeapotProviderLink,
    TeapotRole,
} from "../../common/Teapot/TeapotIdentity";
import { readTeapotWokaCategory } from "../../common/Teapot/TeapotWoka";
import {
    TeapotDataConflictError,
    TeapotDataNotFoundError,
    TeapotMapRevisionConflictError,
    TeapotMapWriterLeaseConflictError,
    TeapotRestoreConflictError,
} from "./TeapotDataErrors";
import type {
    AcceptTeapotWokaInput,
    AcceptTeapotCatalogAssetInput,
    AcquireTeapotMapWriterLeaseInput,
    AppendTeapotAuditEventInput,
    CommitTeapotMapWriterLeaseInput,
    ConfirmTeapotAdmissionEndorsementInput,
    ConsumeTeapotMcpApprovalInput,
    ApproveTeapotMcpProposalInput,
    CreateTeapotAdmissionLinkInput,
    CreateTeapotAssetInput,
    CreateTeapotCatalogInput,
    CreateTeapotEndorsementInput,
    CreateTeapotEndorsementIntentInput,
    CreateTeapotMcpSessionInput,
    CreateTeapotMcpProposalInput,
    CreateTeapotOAuthStateInput,
    ResolveTeapotIdentityInput,
    ReplaceTeapotRoomAccessPolicyInput,
    ReplaceTeapotRoomEditorPolicyInput,
    TransitionTeapotMcpProposalInput,
    TeapotDataRepository,
} from "./TeapotDataRepository";
import type { PostgresPool, PostgresQueryable } from "./PostgresClient";
import { withPostgresTransaction } from "./PostgresClient";
import type {
    TeapotAcceptedWokaRecord,
    TeapotAcceptedCatalogAssetRecord,
    TeapotActiveWokaSelectionRecord,
    TeapotAdmissionConfirmationRecord,
    TeapotAdmissionLinkRecord,
    TeapotAssetCatalog,
    TeapotAssetKind,
    TeapotAssetRecord,
    TeapotAuditEventRecord,
    TeapotCapabilityGrant,
    TeapotCatalogAssetRecord,
    TeapotDataExport,
    TeapotEndorsementRecord,
    TeapotEndorsementIntentRecord,
    TeapotEndorsementState,
    TeapotJsonValue,
    TeapotMapMutationSource,
    TeapotMapRevisionRecord,
    TeapotMapWriterLease,
    TeapotMcpApprovalRecord,
    TeapotMcpProposalRecord,
    TeapotMcpProposalState,
    TeapotMcpSessionRecord,
    TeapotOAuthStateRecord,
    TeapotRoomEditorAccessRecord,
    TeapotRoomEditorGrantRecord,
    TeapotRoomEditorPolicyRecord,
    TeapotRoomAccessGrantRecord,
    TeapotRoomAccessMode,
    TeapotRoomAccessPolicyRecord,
    TeapotRoomAccessRecord,
    TeapotRoomAccessRole,
    TeapotRoomVisitorRecord,
    TeapotRoleAssignment,
} from "./TeapotRecords";

interface IdentityRow {
    id: string;
    display_name: string | null;
    admission_state: TeapotAdmissionState;
    created_at: Date | string;
    updated_at: Date | string;
}

interface ProviderLinkRow {
    user_id: string;
    provider: string;
    provider_subject: string;
    created_at: Date | string;
}

interface RoleRow {
    user_id: string;
    role: TeapotRole;
    created_at: Date | string;
}

interface CapabilityRow {
    user_id: string;
    capability: TeapotCapability;
    created_at: Date | string;
}

interface CatalogRow {
    id: string;
    owner_id: string;
    kind: TeapotAssetKind;
    name: string;
    created_at: Date | string;
    updated_at: Date | string;
}

interface AssetRow {
    id: string;
    owner_id: string;
    object_reference: string;
    kind: TeapotAssetKind;
    media_type: string;
    metadata: TeapotJsonValue;
    published: boolean;
    created_at: Date | string;
    deleted_at: Date | string | null;
}

interface CatalogAssetRow {
    catalog_id: string;
    asset_id: string;
    position: number;
    created_at: Date | string;
}

interface ActiveWokaSelectionRow {
    owner_id: string;
    asset_id: string;
    updated_at: Date | string;
}

interface NextPositionRow {
    next_position: number | string;
}

interface MapRevisionRow {
    map_id: string;
    revision: number | string;
    last_object_reference: string | null;
    updated_by: string | null;
    updated_at: Date | string;
}

interface WriterLeaseRow {
    map_id: string;
    lease_token: string;
    writer_id: string;
    expected_revision: number | string;
    source: TeapotMapMutationSource;
    expires_at: Date | string;
    created_at: Date | string;
}

interface RoomAccessPolicyRow {
    map_id: string;
    role: TeapotRoomAccessRole;
    mode: TeapotRoomAccessMode;
    version: number | string;
    updated_by: string | null;
    created_at: Date | string;
    updated_at: Date | string;
}

interface RoomAccessGrantRow {
    map_id: string;
    role: TeapotRoomAccessRole;
    user_id: string;
    granted_by: string | null;
    created_at: Date | string;
}

interface RoomVisitorRow {
    map_id: string;
    user_id: string;
    first_visited_at: Date | string;
    last_visited_at: Date | string;
    visit_count: number | string;
}

interface McpSessionRow {
    id: string;
    owner_id: string;
    client_name: string;
    token_hash: string;
    expires_at: Date | string;
    revoked_at: Date | string | null;
    created_at: Date | string;
}

interface McpProposalRow {
    id: string;
    owner_id: string;
    session_id: string;
    client_name: string;
    tool_name: string;
    title: string;
    summary: string;
    state: TeapotMcpProposalState;
    payload: TeapotJsonValue;
    patch_digest: string;
    map_url: string | null;
    expected_revision: number | string | null;
    estimated_cost_usd: number | string | null;
    created_at: Date | string;
    updated_at: Date | string;
    expires_at: Date | string;
    terminal_message: string | null;
    result: TeapotJsonValue | null;
}

interface McpApprovalRow {
    id: string;
    proposal_id: string;
    owner_id: string;
    session_id: string;
    tool_name: string;
    patch_digest: string;
    expected_revision: number | string | null;
    token_hash: string;
    expires_at: Date | string;
    used_at: Date | string | null;
    created_at: Date | string;
}

interface EndorsementRow {
    id: string;
    candidate_id: string;
    endorser_id: string;
    state: TeapotEndorsementState;
    created_at: Date | string;
    updated_at: Date | string;
}

interface OAuthStateRow {
    state_hash: string;
    provider: "x";
    encrypted_code_verifier: string;
    redirect_uri: string;
    return_to: string;
    expires_at: Date | string;
    consumed_at: Date | string | null;
    created_at: Date | string;
}

interface AdmissionLinkRow {
    id: string;
    candidate_id: string;
    token_hash: string;
    expires_at: Date | string;
    revoked_at: Date | string | null;
    created_at: Date | string;
}

interface EndorsementIntentRow {
    id: string;
    admission_link_id: string;
    candidate_id: string;
    endorser_id: string;
    token_hash: string;
    expires_at: Date | string;
    consumed_at: Date | string | null;
    revoked_at: Date | string | null;
    created_at: Date | string;
}

interface CountRow {
    count: number | string;
}

interface AuditEventRow {
    id: string;
    actor_id: string | null;
    action: string;
    object_type: string;
    object_id: string;
    details: TeapotJsonValue;
    created_at: Date | string;
}

interface OwnerPairRow {
    catalog_owner_id: string;
    asset_owner_id: string;
}

interface HasDataRow {
    has_data: boolean;
}

export interface PostgresTeapotDataRepositoryOptions {
    createId?: () => string;
    now?: () => Date;
}

export class PostgresTeapotDataRepository implements TeapotDataRepository {
    private readonly createId: () => string;
    private readonly now: () => Date;

    constructor(
        private readonly pool: PostgresPool,
        options: PostgresTeapotDataRepositoryOptions = {},
    ) {
        this.createId = options.createId ?? randomUUID;
        this.now = options.now ?? (() => new Date());
    }

    async resolveIdentity(input: ResolveTeapotIdentityInput): Promise<TeapotIdentity> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.lockProviderLink(client, input.provider, input.providerSubject);
            const existing = await this.findProviderLinkWith(client, input.provider, input.providerSubject);
            if (existing !== null) {
                return this.requireIdentityWith(client, existing.userId);
            }
            const timestamp = this.now().toISOString();
            const identity: TeapotIdentity = {
                id: this.createId(),
                displayName: input.displayName ?? null,
                admissionState: "pending",
                createdAt: timestamp,
                updatedAt: timestamp,
            };
            await client.query(
                `INSERT INTO teapot_users (id, display_name, admission_state, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [identity.id, identity.displayName, identity.admissionState, identity.createdAt, identity.updatedAt],
            );
            await client.query(
                `INSERT INTO teapot_provider_links (user_id, provider, provider_subject, created_at)
                 VALUES ($1, $2, $3, $4)`,
                [identity.id, input.provider, input.providerSubject, timestamp],
            );
            await client.query("INSERT INTO teapot_user_roles (user_id, role, created_at) VALUES ($1, 'member', $2)", [
                identity.id,
                timestamp,
            ]);
            return identity;
        });
    }

    async getIdentity(userId: string): Promise<TeapotIdentity | null> {
        return this.getIdentityWith(this.pool, userId);
    }

    async updateAdmissionState(userId: string, admissionState: TeapotAdmissionState): Promise<TeapotIdentity> {
        const result = await this.pool.query<IdentityRow>(
            `UPDATE teapot_users SET admission_state = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
            [userId, admissionState, this.now().toISOString()],
        );
        const row = result.rows[0];
        if (row === undefined) throw new TeapotDataNotFoundError(`Teapot user ${userId} does not exist`);
        return mapIdentity(row);
    }

    async findProviderLink(provider: string, providerSubject: string): Promise<TeapotProviderLink | null> {
        return this.findProviderLinkWith(this.pool, provider, providerSubject);
    }

    async findProviderLinkForUser(userId: string, provider: string): Promise<TeapotProviderLink | null> {
        const result = await this.pool.query<ProviderLinkRow>(
            "SELECT * FROM teapot_provider_links WHERE user_id = $1 AND provider = $2",
            [userId, provider],
        );
        return result.rows[0] === undefined ? null : mapProviderLink(result.rows[0]);
    }

    async hasProviderLink(userId: string, provider: string): Promise<boolean> {
        const result = await this.pool.query<{ has_link: boolean }>(
            `SELECT EXISTS(
                SELECT 1 FROM teapot_provider_links WHERE user_id = $1 AND provider = $2
             ) AS has_link`,
            [userId, provider],
        );
        return result.rows[0]?.has_link ?? false;
    }

    async linkProvider(userId: string, provider: string, providerSubject: string): Promise<TeapotProviderLink> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.requireIdentityWith(client, userId);
            await this.lockProviderLink(client, provider, providerSubject);
            const existing = await this.findProviderLinkWith(client, provider, providerSubject);
            if (existing !== null) {
                if (existing.userId === userId) return existing;
                throw new TeapotDataConflictError(`Provider identity ${provider}:${providerSubject} is already linked`);
            }
            const link: TeapotProviderLink = {
                userId,
                provider,
                providerSubject,
                createdAt: this.now().toISOString(),
            };
            await client.query(
                `INSERT INTO teapot_provider_links (user_id, provider, provider_subject, created_at)
                 VALUES ($1, $2, $3, $4)`,
                [link.userId, link.provider, link.providerSubject, link.createdAt],
            );
            return link;
        });
    }

    async addRole(userId: string, role: TeapotRole): Promise<void> {
        await this.requireIdentityWith(this.pool, userId);
        await this.pool.query(
            `INSERT INTO teapot_user_roles (user_id, role, created_at) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, role) DO NOTHING`,
            [userId, role, this.now().toISOString()],
        );
    }

    async listRoles(userId: string): Promise<TeapotRole[]> {
        await this.requireIdentityWith(this.pool, userId);
        const result = await this.pool.query<RoleRow>(
            "SELECT user_id, role, created_at FROM teapot_user_roles WHERE user_id = $1 ORDER BY role",
            [userId],
        );
        return result.rows.map((row) => row.role);
    }

    async grantCapability(userId: string, capability: TeapotCapability): Promise<void> {
        await this.requireIdentityWith(this.pool, userId);
        await this.pool.query(
            `INSERT INTO teapot_capability_grants (user_id, capability, created_at) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, capability) DO NOTHING`,
            [userId, capability, this.now().toISOString()],
        );
    }

    async listCapabilityGrants(userId: string): Promise<TeapotCapability[]> {
        await this.requireIdentityWith(this.pool, userId);
        const result = await this.pool.query<CapabilityRow>(
            `SELECT user_id, capability, created_at FROM teapot_capability_grants
             WHERE user_id = $1 ORDER BY capability`,
            [userId],
        );
        return result.rows.map((row) => row.capability);
    }

    async createCatalog(input: CreateTeapotCatalogInput): Promise<TeapotAssetCatalog> {
        await this.requireIdentityWith(this.pool, input.ownerId);
        const timestamp = this.now().toISOString();
        const catalog: TeapotAssetCatalog = {
            id: this.createId(),
            ownerId: input.ownerId,
            kind: input.kind,
            name: input.name,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await this.pool.query(
            `INSERT INTO teapot_asset_catalogs (id, owner_id, kind, name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [catalog.id, catalog.ownerId, catalog.kind, catalog.name, catalog.createdAt, catalog.updatedAt],
        );
        return catalog;
    }

    async getCatalog(catalogId: string): Promise<TeapotAssetCatalog | null> {
        const result = await this.pool.query<CatalogRow>("SELECT * FROM teapot_asset_catalogs WHERE id = $1", [
            catalogId,
        ]);
        return result.rows[0] === undefined ? null : mapCatalog(result.rows[0]);
    }

    async createAsset(input: CreateTeapotAssetInput): Promise<TeapotAssetRecord> {
        await this.requireIdentityWith(this.pool, input.ownerId);
        const asset: TeapotAssetRecord = {
            id: this.createId(),
            ownerId: input.ownerId,
            objectReference: input.objectReference,
            kind: input.kind,
            mediaType: input.mediaType,
            metadata: input.metadata ?? {},
            published: input.published ?? false,
            createdAt: this.now().toISOString(),
            deletedAt: null,
        };
        await this.pool.query(
            `INSERT INTO teapot_assets
                (id, owner_id, object_reference, kind, media_type, metadata, published, created_at, deleted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                asset.id,
                asset.ownerId,
                asset.objectReference,
                asset.kind,
                asset.mediaType,
                JSON.stringify(asset.metadata),
                asset.published,
                asset.createdAt,
                asset.deletedAt,
            ],
        );
        return asset;
    }

    async getAsset(assetId: string): Promise<TeapotAssetRecord | null> {
        const result = await this.pool.query<AssetRow>("SELECT * FROM teapot_assets WHERE id = $1", [assetId]);
        return result.rows[0] === undefined ? null : mapAsset(result.rows[0]);
    }

    async addAssetToCatalog(catalogId: string, assetId: string, position: number): Promise<TeapotCatalogAssetRecord> {
        const owners = await this.pool.query<OwnerPairRow>(
            `SELECT catalog.owner_id AS catalog_owner_id, asset.owner_id AS asset_owner_id
             FROM teapot_asset_catalogs catalog CROSS JOIN teapot_assets asset
             WHERE catalog.id = $1 AND asset.id = $2`,
            [catalogId, assetId],
        );
        const ownerPair = owners.rows[0];
        if (ownerPair === undefined) throw new TeapotDataNotFoundError("Catalog or asset does not exist");
        if (ownerPair.catalog_owner_id !== ownerPair.asset_owner_id) {
            throw new TeapotDataConflictError("A catalog cannot contain another user's private asset");
        }
        const timestamp = this.now().toISOString();
        const result = await this.pool.query<CatalogAssetRow>(
            `INSERT INTO teapot_catalog_assets (catalog_id, asset_id, position, created_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (catalog_id, asset_id) DO UPDATE SET position = teapot_catalog_assets.position
             RETURNING *`,
            [catalogId, assetId, position, timestamp],
        );
        return mapCatalogAsset(this.requireFirst(result.rows, "Catalog membership was not returned"));
    }

    async acceptWoka(input: AcceptTeapotWokaInput): Promise<TeapotAcceptedWokaRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.requireIdentityWith(client, input.ownerId);
            await this.lockWokaOwner(client, input.ownerId);

            const existingReference = await client.query<{ id: string }>(
                "SELECT id FROM teapot_assets WHERE object_reference = $1",
                [input.objectReference],
            );
            if (existingReference.rows[0] !== undefined) {
                throw new TeapotDataConflictError(`Object reference ${input.objectReference} is already registered`);
            }

            const timestamp = this.now().toISOString();
            const existingCatalog = await client.query<CatalogRow>(
                `SELECT * FROM teapot_asset_catalogs
                 WHERE owner_id = $1 AND kind = 'woka'
                 ORDER BY created_at, id
                 LIMIT 1
                 FOR UPDATE`,
                [input.ownerId],
            );

            let catalog: TeapotAssetCatalog;
            const catalogRow = existingCatalog.rows[0];
            if (catalogRow === undefined) {
                const result = await client.query<CatalogRow>(
                    `INSERT INTO teapot_asset_catalogs (id, owner_id, kind, name, created_at, updated_at)
                     VALUES ($1, $2, 'woka', 'Generated Wokas', $3, $3)
                     RETURNING *`,
                    [this.createId(), input.ownerId, timestamp],
                );
                catalog = mapCatalog(this.requireFirst(result.rows, "Generated Woka catalog was not returned"));
            } else {
                const result = await client.query<CatalogRow>(
                    "UPDATE teapot_asset_catalogs SET updated_at = $2 WHERE id = $1 RETURNING *",
                    [catalogRow.id, timestamp],
                );
                catalog = mapCatalog(this.requireFirst(result.rows, "Generated Woka catalog was not updated"));
            }

            const assetResult = await client.query<AssetRow>(
                `INSERT INTO teapot_assets
                    (id, owner_id, object_reference, kind, media_type, metadata, published, created_at, deleted_at)
                 VALUES ($1, $2, $3, 'woka', 'image/png', $4, false, $5, NULL)
                 RETURNING *`,
                [this.createId(), input.ownerId, input.objectReference, JSON.stringify(input.metadata), timestamp],
            );
            const asset = mapAsset(this.requireFirst(assetResult.rows, "Generated Woka asset was not returned"));

            const positionResult = await client.query<NextPositionRow>(
                `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
                 FROM teapot_catalog_assets
                 WHERE catalog_id = $1`,
                [catalog.id],
            );
            const nextPosition = toNumber(
                this.requireFirst(positionResult.rows, "Generated Woka catalog position was not returned")
                    .next_position,
            );
            const membershipResult = await client.query<CatalogAssetRow>(
                `INSERT INTO teapot_catalog_assets (catalog_id, asset_id, position, created_at)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [catalog.id, asset.id, nextPosition, timestamp],
            );
            const membership = mapCatalogAsset(
                this.requireFirst(membershipResult.rows, "Generated Woka catalog membership was not returned"),
            );

            let selection: TeapotActiveWokaSelectionRecord | null = null;
            if (readTeapotWokaCategory(input.metadata) === "woka") {
                const selectionResult = await client.query<ActiveWokaSelectionRow>(
                    `INSERT INTO teapot_active_woka_selections (owner_id, asset_id, updated_at)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (owner_id) DO UPDATE
                     SET asset_id = EXCLUDED.asset_id, updated_at = EXCLUDED.updated_at
                     RETURNING *`,
                    [input.ownerId, asset.id, timestamp],
                );
                selection = mapActiveWokaSelection(
                    this.requireFirst(selectionResult.rows, "Generated Woka selection was not returned"),
                );
            }

            return { catalog, asset, membership, selection };
        });
    }

    async acceptCatalogAsset(input: AcceptTeapotCatalogAssetInput): Promise<TeapotAcceptedCatalogAssetRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.requireIdentityWith(client, input.ownerId);
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
                `teapot-${input.kind}`,
                input.ownerId,
            ]);
            const timestamp = this.now().toISOString();
            const existingCatalog = await client.query<CatalogRow>(
                `SELECT * FROM teapot_asset_catalogs
                 WHERE owner_id = $1 AND kind = $2 ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
                [input.ownerId, input.kind],
            );
            let catalog: TeapotAssetCatalog;
            const existing = existingCatalog.rows[0];
            if (existing === undefined) {
                const result = await client.query<CatalogRow>(
                    `INSERT INTO teapot_asset_catalogs (id, owner_id, kind, name, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
                    [this.createId(), input.ownerId, input.kind, input.catalogName, timestamp],
                );
                catalog = mapCatalog(this.requireFirst(result.rows, "Asset catalog was not returned"));
            } else {
                const result = await client.query<CatalogRow>(
                    "UPDATE teapot_asset_catalogs SET updated_at = $2 WHERE id = $1 RETURNING *",
                    [existing.id, timestamp],
                );
                catalog = mapCatalog(this.requireFirst(result.rows, "Asset catalog was not updated"));
            }
            const assetResult = await client.query<AssetRow>(
                `INSERT INTO teapot_assets
                    (id, owner_id, object_reference, kind, media_type, metadata, published, created_at, deleted_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL) RETURNING *`,
                [
                    this.createId(),
                    input.ownerId,
                    input.objectReference,
                    input.kind,
                    input.mediaType,
                    JSON.stringify(input.metadata ?? {}),
                    input.published ?? false,
                    timestamp,
                ],
            );
            const asset = mapAsset(this.requireFirst(assetResult.rows, "Asset was not returned"));
            const positionResult = await client.query<NextPositionRow>(
                `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
                 FROM teapot_catalog_assets WHERE catalog_id = $1`,
                [catalog.id],
            );
            const nextPosition = toNumber(
                this.requireFirst(positionResult.rows, "Asset catalog position was not returned").next_position,
            );
            const membershipResult = await client.query<CatalogAssetRow>(
                `INSERT INTO teapot_catalog_assets (catalog_id, asset_id, position, created_at)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [catalog.id, asset.id, nextPosition, timestamp],
            );
            return {
                catalog,
                asset,
                membership: mapCatalogAsset(
                    this.requireFirst(membershipResult.rows, "Asset catalog membership was not returned"),
                ),
            };
        });
    }

    async listAssets(ownerId: string, kind: TeapotAssetKind): Promise<TeapotAssetRecord[]> {
        await this.requireIdentityWith(this.pool, ownerId);
        const result = await this.pool.query<AssetRow>(
            `SELECT * FROM teapot_assets
             WHERE owner_id = $1 AND kind = $2 AND deleted_at IS NULL ORDER BY created_at, id`,
            [ownerId, kind],
        );
        return result.rows.map(mapAsset);
    }

    async listWokas(ownerId: string): Promise<TeapotAssetRecord[]> {
        await this.requireIdentityWith(this.pool, ownerId);
        const result = await this.pool.query<AssetRow>(
            `SELECT * FROM teapot_assets
             WHERE owner_id = $1 AND kind = 'woka' AND deleted_at IS NULL
             ORDER BY created_at, id`,
            [ownerId],
        );
        return result.rows.map(mapAsset);
    }

    async getActiveWokaSelection(ownerId: string): Promise<TeapotActiveWokaSelectionRecord | null> {
        await this.requireIdentityWith(this.pool, ownerId);
        const result = await this.pool.query<ActiveWokaSelectionRow>(
            "SELECT * FROM teapot_active_woka_selections WHERE owner_id = $1",
            [ownerId],
        );
        return result.rows[0] === undefined ? null : mapActiveWokaSelection(result.rows[0]);
    }

    async selectWoka(ownerId: string, assetId: string): Promise<TeapotActiveWokaSelectionRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.requireIdentityWith(client, ownerId);
            await this.lockWokaOwner(client, ownerId);
            const asset = await client.query<AssetRow>(
                `SELECT * FROM teapot_assets
                 WHERE id = $1 AND owner_id = $2 AND kind = 'woka' AND deleted_at IS NULL
                 FOR UPDATE`,
                [assetId, ownerId],
            );
            const selectedAsset = asset.rows[0] === undefined ? null : mapAsset(asset.rows[0]);
            if (selectedAsset === null || readTeapotWokaCategory(selectedAsset.metadata) !== "woka") {
                throw new TeapotDataNotFoundError(`Woka asset ${assetId} does not exist for this owner`);
            }
            const result = await client.query<ActiveWokaSelectionRow>(
                `INSERT INTO teapot_active_woka_selections (owner_id, asset_id, updated_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (owner_id) DO UPDATE
                 SET asset_id = EXCLUDED.asset_id, updated_at = EXCLUDED.updated_at
                 RETURNING *`,
                [ownerId, assetId, this.now().toISOString()],
            );
            return mapActiveWokaSelection(this.requireFirst(result.rows, "Generated Woka selection was not returned"));
        });
    }

    async deleteWoka(ownerId: string, assetId: string): Promise<TeapotAssetRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.requireIdentityWith(client, ownerId);
            await this.lockWokaOwner(client, ownerId);
            const result = await client.query<AssetRow>(
                `UPDATE teapot_assets
                 SET deleted_at = $3
                 WHERE id = $1 AND owner_id = $2 AND kind = 'woka' AND deleted_at IS NULL
                 RETURNING *`,
                [assetId, ownerId, this.now().toISOString()],
            );
            const row = result.rows[0];
            if (row === undefined) {
                throw new TeapotDataNotFoundError(`Woka asset ${assetId} does not exist for this owner`);
            }
            await client.query("DELETE FROM teapot_active_woka_selections WHERE owner_id = $1 AND asset_id = $2", [
                ownerId,
                assetId,
            ]);
            return mapAsset(row);
        });
    }

    async getMapRevision(mapId: string): Promise<TeapotMapRevisionRecord> {
        await this.ensureMapRevision(this.pool, mapId);
        return this.requireMapRevisionWith(this.pool, mapId);
    }

    async acquireMapWriterLease(input: AcquireTeapotMapWriterLeaseInput): Promise<TeapotMapWriterLease> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.requireIdentityWith(client, input.writerId);
            await this.lockMap(client, input.mapId);
            await this.ensureMapRevision(client, input.mapId);
            const revision = await this.requireMapRevisionWith(client, input.mapId, true);
            if (revision.revision !== input.expectedRevision) {
                throw new TeapotMapRevisionConflictError(
                    `Map ${input.mapId} is at revision ${revision.revision}, not ${input.expectedRevision}`,
                );
            }
            const existingResult = await client.query<WriterLeaseRow>(
                "SELECT * FROM teapot_map_writer_leases WHERE map_id = $1 FOR UPDATE",
                [input.mapId],
            );
            const now = this.now();
            const existing = existingResult.rows[0];
            if (existing !== undefined && epochMilliseconds(existing.expires_at) > now.getTime()) {
                throw new TeapotMapWriterLeaseConflictError(`Map ${input.mapId} already has an active writer`);
            }
            if (existing !== undefined) {
                await client.query("DELETE FROM teapot_map_writer_leases WHERE map_id = $1", [input.mapId]);
            }
            const lease: TeapotMapWriterLease = {
                mapId: input.mapId,
                leaseToken: this.createId(),
                writerId: input.writerId,
                expectedRevision: input.expectedRevision,
                source: input.source,
                expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
                createdAt: now.toISOString(),
            };
            await client.query(
                `INSERT INTO teapot_map_writer_leases
                    (map_id, lease_token, writer_id, expected_revision, source, expires_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    lease.mapId,
                    lease.leaseToken,
                    lease.writerId,
                    lease.expectedRevision,
                    lease.source,
                    lease.expiresAt,
                    lease.createdAt,
                ],
            );
            return lease;
        });
    }

    async commitMapWriterLease(input: CommitTeapotMapWriterLeaseInput): Promise<TeapotMapRevisionRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.lockMap(client, input.mapId);
            const leaseResult = await client.query<WriterLeaseRow>(
                "SELECT * FROM teapot_map_writer_leases WHERE map_id = $1 FOR UPDATE",
                [input.mapId],
            );
            const lease = leaseResult.rows[0];
            if (
                lease === undefined ||
                lease.lease_token !== input.leaseToken ||
                lease.writer_id !== input.writerId ||
                epochMilliseconds(lease.expires_at) <= this.now().getTime()
            ) {
                throw new TeapotMapWriterLeaseConflictError(
                    `Writer lease for map ${input.mapId} is missing or expired`,
                );
            }
            const revision = await this.requireMapRevisionWith(client, input.mapId, true);
            if (revision.revision !== toNumber(lease.expected_revision)) {
                throw new TeapotMapRevisionConflictError(
                    `Map ${input.mapId} changed while the writer lease was active`,
                );
            }
            const result = await client.query<MapRevisionRow>(
                `UPDATE teapot_map_revisions
                 SET revision = revision + 1,
                     last_object_reference = COALESCE($2, last_object_reference),
                     updated_by = $3,
                     updated_at = $4
                 WHERE map_id = $1 AND revision = $5
                 RETURNING *`,
                [
                    input.mapId,
                    input.objectReference ?? null,
                    input.writerId,
                    this.now().toISOString(),
                    revision.revision,
                ],
            );
            if (result.rows[0] === undefined) {
                throw new TeapotMapRevisionConflictError(`Map ${input.mapId} changed before commit`);
            }
            await client.query("DELETE FROM teapot_map_writer_leases WHERE map_id = $1", [input.mapId]);
            return mapMapRevision(result.rows[0]);
        });
    }

    async releaseMapWriterLease(mapId: string, leaseToken: string, writerId: string): Promise<void> {
        await this.pool.query(
            "DELETE FROM teapot_map_writer_leases WHERE map_id = $1 AND lease_token = $2 AND writer_id = $3",
            [mapId, leaseToken, writerId],
        );
    }

    async getRoomEditorPolicy(mapId: string): Promise<TeapotRoomEditorPolicyRecord | null> {
        return this.getRoomAccessPolicy(mapId, "edit");
    }

    async listRoomEditorGrants(mapId: string): Promise<TeapotRoomEditorGrantRecord[]> {
        return this.listRoomAccessGrants(mapId, "edit");
    }

    async replaceRoomEditorPolicy(input: ReplaceTeapotRoomEditorPolicyInput): Promise<TeapotRoomEditorAccessRecord> {
        return this.replaceRoomAccessPolicy({
            mapId: input.mapId,
            role: "edit",
            mode: input.mode,
            expectedVersion: input.expectedVersion,
            memberIds: input.editorIds,
            actorId: input.actorId,
        });
    }

    async getRoomAccessPolicy(mapId: string, role: TeapotRoomAccessRole): Promise<TeapotRoomAccessPolicyRecord | null> {
        const result = await this.pool.query<RoomAccessPolicyRow>(
            "SELECT * FROM teapot_room_access_policies WHERE map_id = $1 AND role = $2",
            [mapId, role],
        );
        return result.rows[0] === undefined ? null : mapRoomAccessPolicy(result.rows[0]);
    }

    async listRoomAccessGrants(mapId: string, role: TeapotRoomAccessRole): Promise<TeapotRoomAccessGrantRecord[]> {
        const result = await this.pool.query<RoomAccessGrantRow>(
            "SELECT * FROM teapot_room_access_grants WHERE map_id = $1 AND role = $2 ORDER BY user_id",
            [mapId, role],
        );
        return result.rows.map(mapRoomAccessGrant);
    }

    async replaceRoomAccessPolicy(input: ReplaceTeapotRoomAccessPolicyInput): Promise<TeapotRoomAccessRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            await this.lockMap(client, input.mapId);
            await this.requireIdentityWith(client, input.actorId);
            const memberIds = [...new Set(input.memberIds)].sort();
            for (const memberId of memberIds) await this.requireIdentityWith(client, memberId);

            const currentResult = await client.query<RoomAccessPolicyRow>(
                "SELECT * FROM teapot_room_access_policies WHERE map_id = $1 AND role = $2 FOR UPDATE",
                [input.mapId, input.role],
            );
            const current = currentResult.rows[0];
            const currentVersion = current === undefined ? null : toNumber(current.version);
            if (currentVersion !== input.expectedVersion) {
                throw new TeapotDataConflictError(
                    `Room ${input.role} policy ${input.mapId} changed before it could be saved`,
                );
            }

            const timestamp = this.now().toISOString();
            let policyRow: RoomAccessPolicyRow | undefined;
            if (current === undefined) {
                const result = await client.query<RoomAccessPolicyRow>(
                    `INSERT INTO teapot_room_access_policies
                        (map_id, role, mode, version, updated_by, created_at, updated_at)
                     VALUES ($1, $2, $3, 1, $4, $5, $5)
                    RETURNING *`,
                    [input.mapId, input.role, input.mode, input.actorId, timestamp],
                );
                policyRow = result.rows[0];
            } else {
                const result = await client.query<RoomAccessPolicyRow>(
                    `UPDATE teapot_room_access_policies
                     SET mode = $3, version = version + 1, updated_by = $4, updated_at = $5
                     WHERE map_id = $1 AND role = $2 AND version = $6
                     RETURNING *`,
                    [input.mapId, input.role, input.mode, input.actorId, timestamp, input.expectedVersion],
                );
                policyRow = result.rows[0];
            }
            if (policyRow === undefined) {
                throw new TeapotDataConflictError(
                    `Room ${input.role} policy ${input.mapId} changed before it could be saved`,
                );
            }

            await client.query("DELETE FROM teapot_room_access_grants WHERE map_id = $1 AND role = $2", [
                input.mapId,
                input.role,
            ]);
            const grants: TeapotRoomAccessGrantRecord[] = [];
            for (const userId of memberIds) {
                const grantResult = await client.query<RoomAccessGrantRow>(
                    `INSERT INTO teapot_room_access_grants (map_id, role, user_id, granted_by, created_at)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING *`,
                    [input.mapId, input.role, userId, input.actorId, timestamp],
                );
                grants.push(
                    mapRoomAccessGrant(
                        this.requireFirst(
                            grantResult.rows,
                            `Room ${input.role} grant ${input.mapId}:${userId} was not returned`,
                        ),
                    ),
                );
            }

            return { policy: mapRoomAccessPolicy(policyRow), grants };
        });
    }

    async recordRoomVisit(mapId: string, userId: string): Promise<TeapotRoomVisitorRecord> {
        await this.requireIdentityWith(this.pool, userId);
        const timestamp = this.now().toISOString();
        const result = await this.pool.query<RoomVisitorRow>(
            `INSERT INTO teapot_room_visitors
                (map_id, user_id, first_visited_at, last_visited_at, visit_count)
             VALUES ($1, $2, $3, $3, 1)
             ON CONFLICT (map_id, user_id) DO UPDATE
             SET last_visited_at = EXCLUDED.last_visited_at,
                 visit_count = teapot_room_visitors.visit_count + 1
             RETURNING *`,
            [mapId, userId, timestamp],
        );
        return mapRoomVisitor(this.requireFirst(result.rows, `Room visitor ${mapId}:${userId} was not returned`));
    }

    async listRoomVisitors(mapId: string): Promise<TeapotRoomVisitorRecord[]> {
        const result = await this.pool.query<RoomVisitorRow>(
            "SELECT * FROM teapot_room_visitors WHERE map_id = $1 ORDER BY last_visited_at DESC, user_id",
            [mapId],
        );
        return result.rows.map(mapRoomVisitor);
    }

    async createMcpSession(input: CreateTeapotMcpSessionInput): Promise<TeapotMcpSessionRecord> {
        await this.requireIdentityWith(this.pool, input.ownerId);
        const session: TeapotMcpSessionRecord = {
            id: this.createId(),
            ownerId: input.ownerId,
            clientName: input.clientName,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            revokedAt: null,
            createdAt: this.now().toISOString(),
        };
        await this.pool.query(
            `INSERT INTO teapot_mcp_sessions
                (id, owner_id, client_name, token_hash, expires_at, revoked_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                session.id,
                session.ownerId,
                session.clientName,
                session.tokenHash,
                session.expiresAt,
                session.revokedAt,
                session.createdAt,
            ],
        );
        return session;
    }

    async getMcpSession(sessionId: string): Promise<TeapotMcpSessionRecord | null> {
        const result = await this.pool.query<McpSessionRow>("SELECT * FROM teapot_mcp_sessions WHERE id = $1", [
            sessionId,
        ]);
        return result.rows[0] === undefined ? null : mapMcpSession(result.rows[0]);
    }

    async getMcpSessionByTokenHash(tokenHash: string): Promise<TeapotMcpSessionRecord | null> {
        const result = await this.pool.query<McpSessionRow>("SELECT * FROM teapot_mcp_sessions WHERE token_hash = $1", [
            tokenHash,
        ]);
        return result.rows[0] === undefined ? null : mapMcpSession(result.rows[0]);
    }

    async revokeMcpSession(
        sessionId: string,
        ownerId: string,
        revokedAt: string,
    ): Promise<TeapotMcpSessionRecord | null> {
        const result = await this.pool.query<McpSessionRow>(
            `UPDATE teapot_mcp_sessions SET revoked_at = $3
             WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL
             RETURNING *`,
            [sessionId, ownerId, revokedAt],
        );
        return result.rows[0] === undefined ? null : mapMcpSession(result.rows[0]);
    }

    async createMcpProposal(input: CreateTeapotMcpProposalInput): Promise<TeapotMcpProposalRecord> {
        await this.requireIdentityWith(this.pool, input.ownerId);
        const timestamp = this.now().toISOString();
        const proposal: TeapotMcpProposalRecord = {
            id: this.createId(),
            ownerId: input.ownerId,
            sessionId: input.sessionId,
            clientName: input.clientName,
            toolName: input.toolName,
            title: input.title,
            summary: input.summary,
            state: "pending",
            payload: input.payload,
            patchDigest: input.patchDigest,
            mapUrl: input.mapUrl ?? null,
            expectedRevision: input.expectedRevision ?? null,
            estimatedCostUsd: input.estimatedCostUsd ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
            expiresAt: input.expiresAt,
            terminalMessage: null,
            result: null,
        };
        await this.pool.query(
            `INSERT INTO teapot_mcp_proposals
                (id, owner_id, session_id, client_name, tool_name, title, summary, state, payload,
                 patch_digest, map_url, expected_revision, estimated_cost_usd, created_at, updated_at,
                 expires_at, terminal_message, result)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
             FROM teapot_mcp_sessions
             WHERE id = $3 AND owner_id = $2 AND revoked_at IS NULL AND expires_at > $14`,
            [
                proposal.id,
                proposal.ownerId,
                proposal.sessionId,
                proposal.clientName,
                proposal.toolName,
                proposal.title,
                proposal.summary,
                proposal.state,
                JSON.stringify(proposal.payload),
                proposal.patchDigest,
                proposal.mapUrl,
                proposal.expectedRevision,
                proposal.estimatedCostUsd,
                proposal.createdAt,
                proposal.updatedAt,
                proposal.expiresAt,
                proposal.terminalMessage,
                proposal.result,
            ],
        );
        const stored = await this.getMcpProposal(proposal.id);
        if (stored === null) throw new TeapotDataNotFoundError("The MCP session does not belong to this user");
        return stored;
    }

    async getMcpProposal(proposalId: string): Promise<TeapotMcpProposalRecord | null> {
        const result = await this.pool.query<McpProposalRow>("SELECT * FROM teapot_mcp_proposals WHERE id = $1", [
            proposalId,
        ]);
        return result.rows[0] === undefined ? null : mapMcpProposal(result.rows[0]);
    }

    async listMcpProposals(ownerId: string, sessionId?: string): Promise<TeapotMcpProposalRecord[]> {
        const result = await this.pool.query<McpProposalRow>(
            `SELECT * FROM teapot_mcp_proposals
             WHERE owner_id = $1 AND ($2::uuid IS NULL OR session_id = $2)
             ORDER BY created_at DESC`,
            [ownerId, sessionId ?? null],
        );
        return result.rows.map(mapMcpProposal);
    }

    async transitionMcpProposal(input: TransitionTeapotMcpProposalInput): Promise<TeapotMcpProposalRecord | null> {
        const result = await this.pool.query<McpProposalRow>(
            `UPDATE teapot_mcp_proposals
             SET state = $5, terminal_message = COALESCE($6, terminal_message),
                 result = COALESCE($7::jsonb, result), updated_at = $8
             WHERE id = $1 AND owner_id = $2 AND ($3::uuid IS NULL OR session_id = $3)
               AND state = ANY($4::text[])
             RETURNING *`,
            [
                input.proposalId,
                input.ownerId,
                input.sessionId ?? null,
                input.fromStates,
                input.toState,
                input.terminalMessage ?? null,
                input.result === undefined ? null : JSON.stringify(input.result),
                this.now().toISOString(),
            ],
        );
        return result.rows[0] === undefined ? null : mapMcpProposal(result.rows[0]);
    }

    async approveMcpProposal(input: ApproveTeapotMcpProposalInput): Promise<TeapotMcpApprovalRecord | null> {
        return withPostgresTransaction(this.pool, async (client) => {
            const proposalResult = await client.query<McpProposalRow>(
                `SELECT * FROM teapot_mcp_proposals
                 WHERE id = $1 AND owner_id = $2 AND state = 'pending'
                 FOR UPDATE`,
                [input.proposalId, input.ownerId],
            );
            const row = proposalResult.rows[0];
            if (row === undefined) return null;
            const proposal = mapMcpProposal(row);
            const timestamp = this.now().toISOString();
            const approval: TeapotMcpApprovalRecord = {
                id: input.approvalId,
                proposalId: proposal.id,
                ownerId: proposal.ownerId,
                sessionId: proposal.sessionId,
                toolName: proposal.toolName,
                patchDigest: proposal.patchDigest,
                expectedRevision: proposal.expectedRevision,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt,
                usedAt: null,
                createdAt: timestamp,
            };
            await client.query(
                `INSERT INTO teapot_mcp_approvals
                    (id, proposal_id, owner_id, session_id, tool_name, patch_digest, expected_revision,
                     token_hash, expires_at, used_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    approval.id,
                    approval.proposalId,
                    approval.ownerId,
                    approval.sessionId,
                    approval.toolName,
                    approval.patchDigest,
                    approval.expectedRevision,
                    approval.tokenHash,
                    approval.expiresAt,
                    approval.usedAt,
                    approval.createdAt,
                ],
            );
            await client.query("UPDATE teapot_mcp_proposals SET state = 'approved', updated_at = $2 WHERE id = $1", [
                proposal.id,
                timestamp,
            ]);
            return approval;
        });
    }

    async getMcpApproval(proposalId: string): Promise<TeapotMcpApprovalRecord | null> {
        const result = await this.pool.query<McpApprovalRow>(
            "SELECT * FROM teapot_mcp_approvals WHERE proposal_id = $1",
            [proposalId],
        );
        return result.rows[0] === undefined ? null : mapMcpApproval(result.rows[0]);
    }

    async consumeMcpApproval(input: ConsumeTeapotMcpApprovalInput): Promise<TeapotMcpApprovalRecord | null> {
        const result = await this.pool.query<McpApprovalRow>(
            `UPDATE teapot_mcp_approvals approval SET used_at = $6
             FROM teapot_mcp_proposals proposal
             WHERE approval.id = $1 AND approval.proposal_id = $2 AND approval.owner_id = $3
               AND approval.session_id = $4 AND approval.token_hash = $5 AND approval.used_at IS NULL
               AND approval.expires_at > $6 AND proposal.id = approval.proposal_id AND proposal.state = 'approved'
             RETURNING approval.*`,
            [input.approvalId, input.proposalId, input.ownerId, input.sessionId, input.tokenHash, input.usedAt],
        );
        return result.rows[0] === undefined ? null : mapMcpApproval(result.rows[0]);
    }

    async createEndorsement(input: CreateTeapotEndorsementInput): Promise<TeapotEndorsementRecord> {
        await this.requireIdentityWith(this.pool, input.candidateId);
        await this.requireIdentityWith(this.pool, input.endorserId);
        if (input.candidateId === input.endorserId) {
            throw new TeapotDataConflictError("A user cannot endorse themselves");
        }
        const timestamp = this.now().toISOString();
        const endorsement: TeapotEndorsementRecord = {
            id: this.createId(),
            candidateId: input.candidateId,
            endorserId: input.endorserId,
            state: input.state ?? "pending",
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await this.pool.query(
            `INSERT INTO teapot_endorsements
                (id, candidate_id, endorser_id, state, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                endorsement.id,
                endorsement.candidateId,
                endorsement.endorserId,
                endorsement.state,
                endorsement.createdAt,
                endorsement.updatedAt,
            ],
        );
        return endorsement;
    }

    async listEndorsements(candidateId: string): Promise<TeapotEndorsementRecord[]> {
        const result = await this.pool.query<EndorsementRow>(
            "SELECT * FROM teapot_endorsements WHERE candidate_id = $1 ORDER BY created_at, id",
            [candidateId],
        );
        return result.rows.map(mapEndorsement);
    }

    async createOAuthState(input: CreateTeapotOAuthStateInput): Promise<TeapotOAuthStateRecord> {
        const createdAt = this.now().toISOString();
        const result = await this.pool.query<OAuthStateRow>(
            `INSERT INTO teapot_oauth_states
                (state_hash, provider, encrypted_code_verifier, redirect_uri, return_to, expires_at, consumed_at, created_at)
             VALUES ($1, 'x', $2, $3, $4, $5, NULL, $6)
             RETURNING *`,
            [
                input.stateHash,
                input.encryptedCodeVerifier,
                input.redirectUri,
                input.returnTo,
                input.expiresAt,
                createdAt,
            ],
        );
        return mapOAuthState(this.requireFirst(result.rows, "OAuth state was not returned"));
    }

    async consumeOAuthState(stateHash: string, consumedAt: string): Promise<TeapotOAuthStateRecord | null> {
        const result = await this.pool.query<OAuthStateRow>(
            `UPDATE teapot_oauth_states
             SET consumed_at = $2
             WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > $2
             RETURNING *`,
            [stateHash, consumedAt],
        );
        return result.rows[0] === undefined ? null : mapOAuthState(result.rows[0]);
    }

    async createAdmissionLink(input: CreateTeapotAdmissionLinkInput): Promise<TeapotAdmissionLinkRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            await client.query(
                `SELECT id FROM teapot_admission_links
                 WHERE candidate_id = $1 AND revoked_at IS NULL
                 FOR UPDATE`,
                [input.candidateId],
            );
            const candidate = await client.query<IdentityRow>("SELECT * FROM teapot_users WHERE id = $1 FOR UPDATE", [
                input.candidateId,
            ]);
            const candidateRow = candidate.rows[0];
            if (candidateRow === undefined) {
                throw new TeapotDataNotFoundError(`Teapot user ${input.candidateId} does not exist`);
            }
            if (candidateRow.admission_state !== "pending") {
                throw new TeapotDataConflictError("Only pending candidates can create an admission link");
            }
            const createdAt = this.now().toISOString();
            await client.query(
                `UPDATE teapot_admission_links SET revoked_at = $2
                 WHERE candidate_id = $1 AND revoked_at IS NULL`,
                [input.candidateId, createdAt],
            );
            const result = await client.query<AdmissionLinkRow>(
                `INSERT INTO teapot_admission_links
                    (id, candidate_id, token_hash, expires_at, revoked_at, created_at)
                 VALUES ($1, $2, $3, $4, NULL, $5)
                 RETURNING *`,
                [this.createId(), input.candidateId, input.tokenHash, input.expiresAt, createdAt],
            );
            return mapAdmissionLink(this.requireFirst(result.rows, "Admission link was not returned"));
        });
    }

    async findAdmissionLinkByTokenHash(tokenHash: string): Promise<TeapotAdmissionLinkRecord | null> {
        const result = await this.pool.query<AdmissionLinkRow>(
            "SELECT * FROM teapot_admission_links WHERE token_hash = $1",
            [tokenHash],
        );
        return result.rows[0] === undefined ? null : mapAdmissionLink(result.rows[0]);
    }

    async revokeAdmissionLinks(candidateId: string, revokedAt: string): Promise<void> {
        await this.pool.query(
            `UPDATE teapot_admission_links
             SET revoked_at = $2
             WHERE candidate_id = $1 AND revoked_at IS NULL`,
            [candidateId, revokedAt],
        );
    }

    async createEndorsementIntent(input: CreateTeapotEndorsementIntentInput): Promise<TeapotEndorsementIntentRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            const createdAt = this.now().toISOString();
            await client.query("SELECT id FROM teapot_admission_links WHERE id = $1 FOR UPDATE", [
                input.admissionLinkId,
            ]);
            await client.query(
                `UPDATE teapot_endorsement_intents
                 SET revoked_at = $3
                 WHERE admission_link_id = $1
                   AND endorser_id = $2
                   AND consumed_at IS NULL
                   AND revoked_at IS NULL
                   AND expires_at <= $3`,
                [input.admissionLinkId, input.endorserId, createdAt],
            );
            const existingIntent = await client.query<{ id: string }>(
                `SELECT intent.id
                 FROM teapot_endorsement_intents intent
                 JOIN teapot_admission_links link ON link.id = intent.admission_link_id
                 WHERE intent.candidate_id = $1
                   AND intent.endorser_id = $2
                   AND intent.consumed_at IS NULL
                   AND intent.revoked_at IS NULL
                   AND intent.expires_at > $3
                   AND link.revoked_at IS NULL
                   AND link.expires_at > $3`,
                [input.candidateId, input.endorserId, createdAt],
            );
            if (existingIntent.rows[0] !== undefined) {
                throw new TeapotDataConflictError("An endorsement confirmation is already pending");
            }
            const result = await client.query<EndorsementIntentRow>(
                `INSERT INTO teapot_endorsement_intents
                    (id, admission_link_id, candidate_id, endorser_id, token_hash, expires_at, consumed_at, revoked_at, created_at)
                 SELECT $1, link.id, $3, $4, $5, $6, NULL, NULL, $7
                 FROM teapot_admission_links link
                 JOIN teapot_users candidate ON candidate.id = link.candidate_id
                 JOIN teapot_users endorser ON endorser.id = $4
                 WHERE link.id = $2
                   AND link.candidate_id = $3
                   AND link.revoked_at IS NULL
                   AND link.expires_at > $7
                   AND candidate.admission_state = 'pending'
                   AND endorser.admission_state = 'admitted'
                   AND candidate.id <> endorser.id
                 RETURNING *`,
                [
                    this.createId(),
                    input.admissionLinkId,
                    input.candidateId,
                    input.endorserId,
                    input.tokenHash,
                    input.expiresAt,
                    createdAt,
                ],
            );
            const row = result.rows[0];
            if (row === undefined) {
                throw new TeapotDataConflictError("Admission link cannot be used for this endorsement");
            }
            return mapEndorsementIntent(row);
        });
    }

    async confirmAdmissionEndorsement(
        input: ConfirmTeapotAdmissionEndorsementInput,
    ): Promise<TeapotAdmissionConfirmationRecord> {
        return withPostgresTransaction(this.pool, async (client) => {
            const intentResult = await client.query<EndorsementIntentRow>(
                "SELECT * FROM teapot_endorsement_intents WHERE token_hash = $1 FOR UPDATE",
                [input.tokenHash],
            );
            const intentRow = intentResult.rows[0];
            if (
                intentRow === undefined ||
                intentRow.endorser_id !== input.endorserId ||
                intentRow.consumed_at !== null ||
                intentRow.revoked_at !== null ||
                Date.parse(iso(intentRow.expires_at)) <= Date.parse(input.confirmedAt)
            ) {
                throw new TeapotDataConflictError("Endorsement confirmation is invalid or expired");
            }

            const linkResult = await client.query<AdmissionLinkRow>(
                "SELECT * FROM teapot_admission_links WHERE id = $1 FOR UPDATE",
                [intentRow.admission_link_id],
            );
            const linkRow = linkResult.rows[0];
            if (
                linkRow === undefined ||
                linkRow.candidate_id !== intentRow.candidate_id ||
                linkRow.revoked_at !== null ||
                Date.parse(iso(linkRow.expires_at)) <= Date.parse(input.confirmedAt)
            ) {
                throw new TeapotDataConflictError("Admission link is invalid or expired");
            }

            const candidateResult = await client.query<IdentityRow>(
                "SELECT * FROM teapot_users WHERE id = $1 FOR UPDATE",
                [intentRow.candidate_id],
            );
            const candidateRow = candidateResult.rows[0];
            const endorser = await this.requireIdentityWith(client, input.endorserId);
            if (candidateRow === undefined) throw new TeapotDataNotFoundError("Admission candidate does not exist");
            if (candidateRow.admission_state !== "pending") {
                throw new TeapotDataConflictError("The candidate is not pending admission");
            }
            if (endorser.admissionState !== "admitted") {
                throw new TeapotDataConflictError("Only admitted users can endorse candidates");
            }
            if (candidateRow.id === endorser.id) throw new TeapotDataConflictError("A user cannot endorse themselves");

            const existing = await client.query<EndorsementRow>(
                "SELECT * FROM teapot_endorsements WHERE candidate_id = $1 AND endorser_id = $2",
                [candidateRow.id, endorser.id],
            );
            if (existing.rows[0] !== undefined) {
                throw new TeapotDataConflictError("This endorser already endorsed the candidate");
            }

            const endorsementResult = await client.query<EndorsementRow>(
                `INSERT INTO teapot_endorsements
                    (id, candidate_id, endorser_id, state, created_at, updated_at)
                 VALUES ($1, $2, $3, 'accepted', $4, $4)
                 RETURNING *`,
                [this.createId(), candidateRow.id, endorser.id, input.confirmedAt],
            );
            const endorsement = mapEndorsement(
                this.requireFirst(endorsementResult.rows, "Accepted endorsement was not returned"),
            );
            await client.query("UPDATE teapot_endorsement_intents SET consumed_at = $2 WHERE id = $1", [
                intentRow.id,
                input.confirmedAt,
            ]);
            const countResult = await client.query<CountRow>(
                "SELECT COUNT(*) AS count FROM teapot_endorsements WHERE candidate_id = $1 AND state = 'accepted'",
                [candidateRow.id],
            );
            const acceptedEndorsements = toNumber(
                this.requireFirst(countResult.rows, "Endorsement count was not returned").count,
            );
            const admittedNow = acceptedEndorsements >= input.requiredEndorsements;
            let candidate = mapIdentity(candidateRow);
            if (admittedNow) {
                const admittedResult = await client.query<IdentityRow>(
                    `UPDATE teapot_users
                     SET admission_state = 'admitted', updated_at = $2
                     WHERE id = $1
                     RETURNING *`,
                    [candidateRow.id, input.confirmedAt],
                );
                candidate = mapIdentity(this.requireFirst(admittedResult.rows, "Admitted candidate was not returned"));
                await client.query(
                    `INSERT INTO teapot_user_roles (user_id, role, created_at)
                     VALUES ($1, 'creator', $2)
                     ON CONFLICT (user_id, role) DO NOTHING`,
                    [candidateRow.id, input.confirmedAt],
                );
                await client.query(
                    `UPDATE teapot_admission_links SET revoked_at = $2
                     WHERE candidate_id = $1 AND revoked_at IS NULL`,
                    [candidateRow.id, input.confirmedAt],
                );
            }
            return { endorsement, candidate, acceptedEndorsements, admittedNow };
        });
    }

    async appendAuditEvent(input: AppendTeapotAuditEventInput): Promise<TeapotAuditEventRecord> {
        if (input.actorId !== undefined) await this.requireIdentityWith(this.pool, input.actorId);
        const event: TeapotAuditEventRecord = {
            id: this.createId(),
            actorId: input.actorId ?? null,
            action: input.action,
            objectType: input.objectType,
            objectId: input.objectId,
            details: input.details ?? {},
            createdAt: this.now().toISOString(),
        };
        await this.pool.query(
            `INSERT INTO teapot_audit_events
                (id, actor_id, action, object_type, object_id, details, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                event.id,
                event.actorId,
                event.action,
                event.objectType,
                event.objectId,
                JSON.stringify(event.details),
                event.createdAt,
            ],
        );
        return event;
    }

    async exportData(): Promise<TeapotDataExport> {
        const [
            users,
            providerLinks,
            roles,
            grants,
            catalogs,
            assets,
            catalogAssets,
            activeWokaSelections,
            mapRevisions,
            writerLeases,
            roomAccessPolicies,
            roomAccessGrants,
            roomVisitors,
            mcpSessions,
            mcpProposals,
            mcpApprovals,
            endorsements,
            oauthStates,
            admissionLinks,
            endorsementIntents,
            auditEvents,
        ] = await Promise.all([
            this.pool.query<IdentityRow>("SELECT * FROM teapot_users ORDER BY id"),
            this.pool.query<ProviderLinkRow>("SELECT * FROM teapot_provider_links ORDER BY provider, provider_subject"),
            this.pool.query<RoleRow>("SELECT * FROM teapot_user_roles ORDER BY user_id, role"),
            this.pool.query<CapabilityRow>("SELECT * FROM teapot_capability_grants ORDER BY user_id, capability"),
            this.pool.query<CatalogRow>("SELECT * FROM teapot_asset_catalogs ORDER BY id"),
            this.pool.query<AssetRow>("SELECT * FROM teapot_assets ORDER BY id"),
            this.pool.query<CatalogAssetRow>("SELECT * FROM teapot_catalog_assets ORDER BY catalog_id, asset_id"),
            this.pool.query<ActiveWokaSelectionRow>("SELECT * FROM teapot_active_woka_selections ORDER BY owner_id"),
            this.pool.query<MapRevisionRow>("SELECT * FROM teapot_map_revisions ORDER BY map_id"),
            this.pool.query<WriterLeaseRow>("SELECT * FROM teapot_map_writer_leases ORDER BY map_id"),
            this.pool.query<RoomAccessPolicyRow>("SELECT * FROM teapot_room_access_policies ORDER BY map_id, role"),
            this.pool.query<RoomAccessGrantRow>(
                "SELECT * FROM teapot_room_access_grants ORDER BY map_id, role, user_id",
            ),
            this.pool.query<RoomVisitorRow>(
                "SELECT * FROM teapot_room_visitors ORDER BY map_id, last_visited_at DESC, user_id",
            ),
            this.pool.query<McpSessionRow>("SELECT * FROM teapot_mcp_sessions ORDER BY id"),
            this.pool.query<McpProposalRow>("SELECT * FROM teapot_mcp_proposals ORDER BY id"),
            this.pool.query<McpApprovalRow>("SELECT * FROM teapot_mcp_approvals ORDER BY id"),
            this.pool.query<EndorsementRow>("SELECT * FROM teapot_endorsements ORDER BY id"),
            this.pool.query<OAuthStateRow>("SELECT * FROM teapot_oauth_states ORDER BY state_hash"),
            this.pool.query<AdmissionLinkRow>("SELECT * FROM teapot_admission_links ORDER BY id"),
            this.pool.query<EndorsementIntentRow>("SELECT * FROM teapot_endorsement_intents ORDER BY id"),
            this.pool.query<AuditEventRow>("SELECT * FROM teapot_audit_events ORDER BY id"),
        ]);
        return {
            schemaVersion: 4,
            exportedAt: this.now().toISOString(),
            users: users.rows.map(mapIdentity),
            providerLinks: providerLinks.rows.map(mapProviderLink),
            roleAssignments: roles.rows.map(mapRole),
            capabilityGrants: grants.rows.map(mapCapabilityGrant),
            catalogs: catalogs.rows.map(mapCatalog),
            assets: assets.rows.map(mapAsset),
            catalogAssets: catalogAssets.rows.map(mapCatalogAsset),
            activeWokaSelections: activeWokaSelections.rows.map(mapActiveWokaSelection),
            mapRevisions: mapRevisions.rows.map(mapMapRevision),
            writerLeases: writerLeases.rows.map(mapWriterLease),
            roomAccessPolicies: roomAccessPolicies.rows.map(mapRoomAccessPolicy),
            roomAccessGrants: roomAccessGrants.rows.map(mapRoomAccessGrant),
            roomVisitors: roomVisitors.rows.map(mapRoomVisitor),
            mcpSessions: mcpSessions.rows.map(mapMcpSession),
            mcpProposals: mcpProposals.rows.map(mapMcpProposal),
            mcpApprovals: mcpApprovals.rows.map(mapMcpApproval),
            endorsements: endorsements.rows.map(mapEndorsement),
            oauthStates: oauthStates.rows.map(mapOAuthState),
            admissionLinks: admissionLinks.rows.map(mapAdmissionLink),
            endorsementIntents: endorsementIntents.rows.map(mapEndorsementIntent),
            auditEvents: auditEvents.rows.map(mapAuditEvent),
        };
    }

    async restoreData(data: TeapotDataExport): Promise<void> {
        if (data.schemaVersion !== 2 && data.schemaVersion !== 3 && data.schemaVersion !== 4) {
            throw new TeapotRestoreConflictError(`Unsupported Teapot export schema ${String(data.schemaVersion)}`);
        }
        await withPostgresTransaction(this.pool, async (client) => {
            const hasData = await client.query<HasDataRow>(`
                SELECT EXISTS (
                    SELECT 1 FROM teapot_users
                    UNION ALL SELECT 1 FROM teapot_asset_catalogs
                    UNION ALL SELECT 1 FROM teapot_assets
                    UNION ALL SELECT 1 FROM teapot_map_revisions
                    UNION ALL SELECT 1 FROM teapot_room_access_policies
                    UNION ALL SELECT 1 FROM teapot_room_access_grants
                    UNION ALL SELECT 1 FROM teapot_room_visitors
                    UNION ALL SELECT 1 FROM teapot_mcp_sessions
                    UNION ALL SELECT 1 FROM teapot_mcp_proposals
                    UNION ALL SELECT 1 FROM teapot_mcp_approvals
                    UNION ALL SELECT 1 FROM teapot_endorsements
                    UNION ALL SELECT 1 FROM teapot_oauth_states
                    UNION ALL SELECT 1 FROM teapot_admission_links
                    UNION ALL SELECT 1 FROM teapot_endorsement_intents
                    UNION ALL SELECT 1 FROM teapot_audit_events
                ) AS has_data
            `);
            if (hasData.rows[0]?.has_data === true) {
                throw new TeapotRestoreConflictError("Teapot data can only be restored into an empty repository");
            }
            await this.restoreUsers(client, data);
            await this.restoreOwnedRecords(client, data);
            await this.restoreMapRecords(client, data);
            await this.restoreSocialRecords(client, data);
        });
    }

    private async restoreUsers(client: PostgresQueryable, data: TeapotDataExport): Promise<void> {
        for (const user of data.users) {
            await client.query(
                `INSERT INTO teapot_users (id, display_name, admission_state, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user.id, user.displayName, user.admissionState, user.createdAt, user.updatedAt],
            );
        }
        for (const link of data.providerLinks) {
            await client.query(
                `INSERT INTO teapot_provider_links (user_id, provider, provider_subject, created_at)
                 VALUES ($1, $2, $3, $4)`,
                [link.userId, link.provider, link.providerSubject, link.createdAt],
            );
        }
        for (const role of data.roleAssignments) {
            await client.query("INSERT INTO teapot_user_roles (user_id, role, created_at) VALUES ($1, $2, $3)", [
                role.userId,
                role.role,
                role.createdAt,
            ]);
        }
        for (const grant of data.capabilityGrants) {
            await client.query(
                "INSERT INTO teapot_capability_grants (user_id, capability, created_at) VALUES ($1, $2, $3)",
                [grant.userId, grant.capability, grant.createdAt],
            );
        }
    }

    private async restoreOwnedRecords(client: PostgresQueryable, data: TeapotDataExport): Promise<void> {
        for (const catalog of data.catalogs) {
            await client.query(
                `INSERT INTO teapot_asset_catalogs (id, owner_id, kind, name, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [catalog.id, catalog.ownerId, catalog.kind, catalog.name, catalog.createdAt, catalog.updatedAt],
            );
        }
        for (const asset of data.assets) {
            await client.query(
                `INSERT INTO teapot_assets
                    (id, owner_id, object_reference, kind, media_type, metadata, published, created_at, deleted_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    asset.id,
                    asset.ownerId,
                    asset.objectReference,
                    asset.kind,
                    asset.mediaType,
                    JSON.stringify(asset.metadata),
                    asset.published,
                    asset.createdAt,
                    asset.deletedAt,
                ],
            );
        }
        for (const membership of data.catalogAssets) {
            await client.query(
                `INSERT INTO teapot_catalog_assets (catalog_id, asset_id, position, created_at)
                 VALUES ($1, $2, $3, $4)`,
                [membership.catalogId, membership.assetId, membership.position, membership.createdAt],
            );
        }
        for (const selection of data.activeWokaSelections) {
            await client.query(
                `INSERT INTO teapot_active_woka_selections (owner_id, asset_id, updated_at)
                 VALUES ($1, $2, $3)`,
                [selection.ownerId, selection.assetId, selection.updatedAt],
            );
        }
    }

    private async restoreMapRecords(client: PostgresQueryable, data: TeapotDataExport): Promise<void> {
        for (const revision of data.mapRevisions) {
            await client.query(
                `INSERT INTO teapot_map_revisions
                    (map_id, revision, last_object_reference, updated_by, updated_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    revision.mapId,
                    revision.revision,
                    revision.lastObjectReference,
                    revision.updatedBy,
                    revision.updatedAt,
                ],
            );
        }
        for (const lease of data.writerLeases) {
            await client.query(
                `INSERT INTO teapot_map_writer_leases
                    (map_id, lease_token, writer_id, expected_revision, source, expires_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    lease.mapId,
                    lease.leaseToken,
                    lease.writerId,
                    lease.expectedRevision,
                    lease.source,
                    lease.expiresAt,
                    lease.createdAt,
                ],
            );
        }
        const roomAccessPolicies =
            data.roomAccessPolicies ??
            data.roomEditorPolicies?.map((policy) => ({ ...policy, role: "edit" as const })) ??
            [];
        const roomAccessGrants =
            data.roomAccessGrants ?? data.roomEditorGrants?.map((grant) => ({ ...grant, role: "edit" as const })) ?? [];
        for (const policy of roomAccessPolicies) {
            await client.query(
                `INSERT INTO teapot_room_access_policies
                    (map_id, role, mode, version, updated_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    policy.mapId,
                    policy.role,
                    policy.mode,
                    policy.version,
                    policy.updatedBy,
                    policy.createdAt,
                    policy.updatedAt,
                ],
            );
        }
        for (const grant of roomAccessGrants) {
            await client.query(
                `INSERT INTO teapot_room_access_grants (map_id, role, user_id, granted_by, created_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [grant.mapId, grant.role, grant.userId, grant.grantedBy, grant.createdAt],
            );
        }
        for (const visitor of data.roomVisitors ?? []) {
            await client.query(
                `INSERT INTO teapot_room_visitors
                    (map_id, user_id, first_visited_at, last_visited_at, visit_count)
                 VALUES ($1, $2, $3, $4, $5)`,
                [visitor.mapId, visitor.userId, visitor.firstVisitedAt, visitor.lastVisitedAt, visitor.visitCount],
            );
        }
    }

    private async restoreSocialRecords(client: PostgresQueryable, data: TeapotDataExport): Promise<void> {
        for (const session of data.mcpSessions) {
            await client.query(
                `INSERT INTO teapot_mcp_sessions
                    (id, owner_id, client_name, token_hash, expires_at, revoked_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    session.id,
                    session.ownerId,
                    session.clientName,
                    session.tokenHash,
                    session.expiresAt,
                    session.revokedAt,
                    session.createdAt,
                ],
            );
        }
        for (const proposal of data.mcpProposals) {
            await client.query(
                `INSERT INTO teapot_mcp_proposals
                    (id, owner_id, session_id, client_name, tool_name, title, summary, state, payload,
                     patch_digest, map_url, expected_revision, estimated_cost_usd, created_at, updated_at,
                     expires_at, terminal_message, result)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
                [
                    proposal.id,
                    proposal.ownerId,
                    proposal.sessionId,
                    proposal.clientName,
                    proposal.toolName,
                    proposal.title,
                    proposal.summary,
                    proposal.state,
                    JSON.stringify(proposal.payload),
                    proposal.patchDigest,
                    proposal.mapUrl,
                    proposal.expectedRevision,
                    proposal.estimatedCostUsd,
                    proposal.createdAt,
                    proposal.updatedAt,
                    proposal.expiresAt,
                    proposal.terminalMessage,
                    proposal.result === null ? null : JSON.stringify(proposal.result),
                ],
            );
        }
        for (const approval of data.mcpApprovals) {
            await client.query(
                `INSERT INTO teapot_mcp_approvals
                    (id, proposal_id, owner_id, session_id, tool_name, patch_digest, expected_revision,
                     token_hash, expires_at, used_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    approval.id,
                    approval.proposalId,
                    approval.ownerId,
                    approval.sessionId,
                    approval.toolName,
                    approval.patchDigest,
                    approval.expectedRevision,
                    approval.tokenHash,
                    approval.expiresAt,
                    approval.usedAt,
                    approval.createdAt,
                ],
            );
        }
        for (const endorsement of data.endorsements) {
            await client.query(
                `INSERT INTO teapot_endorsements
                    (id, candidate_id, endorser_id, state, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    endorsement.id,
                    endorsement.candidateId,
                    endorsement.endorserId,
                    endorsement.state,
                    endorsement.createdAt,
                    endorsement.updatedAt,
                ],
            );
        }
        for (const state of data.oauthStates) {
            await client.query(
                `INSERT INTO teapot_oauth_states
                    (state_hash, provider, encrypted_code_verifier, redirect_uri, return_to, expires_at, consumed_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    state.stateHash,
                    state.provider,
                    state.encryptedCodeVerifier,
                    state.redirectUri,
                    state.returnTo,
                    state.expiresAt,
                    state.consumedAt,
                    state.createdAt,
                ],
            );
        }
        for (const link of data.admissionLinks) {
            await client.query(
                `INSERT INTO teapot_admission_links
                    (id, candidate_id, token_hash, expires_at, revoked_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [link.id, link.candidateId, link.tokenHash, link.expiresAt, link.revokedAt, link.createdAt],
            );
        }
        for (const intent of data.endorsementIntents) {
            await client.query(
                `INSERT INTO teapot_endorsement_intents
                    (id, admission_link_id, candidate_id, endorser_id, token_hash, expires_at, consumed_at, revoked_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    intent.id,
                    intent.admissionLinkId,
                    intent.candidateId,
                    intent.endorserId,
                    intent.tokenHash,
                    intent.expiresAt,
                    intent.consumedAt,
                    intent.revokedAt,
                    intent.createdAt,
                ],
            );
        }
        for (const event of data.auditEvents) {
            await client.query(
                `INSERT INTO teapot_audit_events
                    (id, actor_id, action, object_type, object_id, details, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    event.id,
                    event.actorId,
                    event.action,
                    event.objectType,
                    event.objectId,
                    JSON.stringify(event.details),
                    event.createdAt,
                ],
            );
        }
    }

    private async getIdentityWith(queryable: PostgresQueryable, userId: string): Promise<TeapotIdentity | null> {
        const result = await queryable.query<IdentityRow>("SELECT * FROM teapot_users WHERE id = $1", [userId]);
        return result.rows[0] === undefined ? null : mapIdentity(result.rows[0]);
    }

    private async requireIdentityWith(queryable: PostgresQueryable, userId: string): Promise<TeapotIdentity> {
        const identity = await this.getIdentityWith(queryable, userId);
        if (identity === null) throw new TeapotDataNotFoundError(`Teapot user ${userId} does not exist`);
        return identity;
    }

    private async findProviderLinkWith(
        queryable: PostgresQueryable,
        provider: string,
        providerSubject: string,
    ): Promise<TeapotProviderLink | null> {
        const result = await queryable.query<ProviderLinkRow>(
            "SELECT * FROM teapot_provider_links WHERE provider = $1 AND provider_subject = $2",
            [provider, providerSubject],
        );
        return result.rows[0] === undefined ? null : mapProviderLink(result.rows[0]);
    }

    private async lockProviderLink(
        queryable: PostgresQueryable,
        provider: string,
        providerSubject: string,
    ): Promise<void> {
        await queryable.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [provider, providerSubject]);
    }

    private async lockMap(queryable: PostgresQueryable, mapId: string): Promise<void> {
        await queryable.query("SELECT pg_advisory_xact_lock(hashtext('teapot-map'), hashtext($1))", [mapId]);
    }

    private async lockWokaOwner(queryable: PostgresQueryable, ownerId: string): Promise<void> {
        await queryable.query("SELECT pg_advisory_xact_lock(hashtext('teapot-woka'), hashtext($1))", [ownerId]);
    }

    private async ensureMapRevision(queryable: PostgresQueryable, mapId: string): Promise<void> {
        await queryable.query(
            `INSERT INTO teapot_map_revisions (map_id, revision, last_object_reference, updated_by, updated_at)
             VALUES ($1, 0, NULL, NULL, $2) ON CONFLICT (map_id) DO NOTHING`,
            [mapId, this.now().toISOString()],
        );
    }

    private async requireMapRevisionWith(
        queryable: PostgresQueryable,
        mapId: string,
        forUpdate = false,
    ): Promise<TeapotMapRevisionRecord> {
        const result = await queryable.query<MapRevisionRow>(
            `SELECT * FROM teapot_map_revisions WHERE map_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
            [mapId],
        );
        return mapMapRevision(this.requireFirst(result.rows, `Map revision ${mapId} was not returned`));
    }

    private requireFirst<T>(rows: T[], message: string): T {
        const row = rows[0];
        if (row === undefined) throw new TeapotDataNotFoundError(message);
        return row;
    }
}

function iso(value: Date | string): string {
    return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function nullableIso(value: Date | string | null): string | null {
    return value === null ? null : iso(value);
}

function epochMilliseconds(value: Date | string): number {
    return typeof value === "string" ? Date.parse(value) : value.getTime();
}

function toNumber(value: number | string): number {
    return typeof value === "number" ? value : Number.parseInt(value, 10);
}

function mapIdentity(row: IdentityRow): TeapotIdentity {
    return {
        id: row.id,
        displayName: row.display_name,
        admissionState: row.admission_state,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
    };
}

function mapProviderLink(row: ProviderLinkRow): TeapotProviderLink {
    return {
        userId: row.user_id,
        provider: row.provider,
        providerSubject: row.provider_subject,
        createdAt: iso(row.created_at),
    };
}

function mapRole(row: RoleRow): TeapotRoleAssignment {
    return { userId: row.user_id, role: row.role, createdAt: iso(row.created_at) };
}

function mapCapabilityGrant(row: CapabilityRow): TeapotCapabilityGrant {
    return { userId: row.user_id, capability: row.capability, createdAt: iso(row.created_at) };
}

function mapCatalog(row: CatalogRow): TeapotAssetCatalog {
    return {
        id: row.id,
        ownerId: row.owner_id,
        kind: row.kind,
        name: row.name,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
    };
}

function mapAsset(row: AssetRow): TeapotAssetRecord {
    return {
        id: row.id,
        ownerId: row.owner_id,
        objectReference: row.object_reference,
        kind: row.kind,
        mediaType: row.media_type,
        metadata: row.metadata,
        published: row.published,
        createdAt: iso(row.created_at),
        deletedAt: nullableIso(row.deleted_at),
    };
}

function mapCatalogAsset(row: CatalogAssetRow): TeapotCatalogAssetRecord {
    return {
        catalogId: row.catalog_id,
        assetId: row.asset_id,
        position: row.position,
        createdAt: iso(row.created_at),
    };
}

function mapActiveWokaSelection(row: ActiveWokaSelectionRow): TeapotActiveWokaSelectionRecord {
    return {
        ownerId: row.owner_id,
        assetId: row.asset_id,
        updatedAt: iso(row.updated_at),
    };
}

function mapMapRevision(row: MapRevisionRow): TeapotMapRevisionRecord {
    return {
        mapId: row.map_id,
        revision: toNumber(row.revision),
        lastObjectReference: row.last_object_reference,
        updatedBy: row.updated_by,
        updatedAt: iso(row.updated_at),
    };
}

function mapWriterLease(row: WriterLeaseRow): TeapotMapWriterLease {
    return {
        mapId: row.map_id,
        leaseToken: row.lease_token,
        writerId: row.writer_id,
        expectedRevision: toNumber(row.expected_revision),
        source: row.source,
        expiresAt: iso(row.expires_at),
        createdAt: iso(row.created_at),
    };
}

function mapRoomAccessPolicy(row: RoomAccessPolicyRow): TeapotRoomAccessPolicyRecord {
    return {
        mapId: row.map_id,
        role: row.role,
        mode: row.mode,
        version: toNumber(row.version),
        updatedBy: row.updated_by,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
    };
}

function mapRoomAccessGrant(row: RoomAccessGrantRow): TeapotRoomAccessGrantRecord {
    return {
        mapId: row.map_id,
        role: row.role,
        userId: row.user_id,
        grantedBy: row.granted_by,
        createdAt: iso(row.created_at),
    };
}

function mapRoomVisitor(row: RoomVisitorRow): TeapotRoomVisitorRecord {
    return {
        mapId: row.map_id,
        userId: row.user_id,
        firstVisitedAt: iso(row.first_visited_at),
        lastVisitedAt: iso(row.last_visited_at),
        visitCount: toNumber(row.visit_count),
    };
}

function mapMcpSession(row: McpSessionRow): TeapotMcpSessionRecord {
    return {
        id: row.id,
        ownerId: row.owner_id,
        clientName: row.client_name,
        tokenHash: row.token_hash,
        expiresAt: iso(row.expires_at),
        revokedAt: nullableIso(row.revoked_at),
        createdAt: iso(row.created_at),
    };
}

function mapMcpProposal(row: McpProposalRow): TeapotMcpProposalRecord {
    return {
        id: row.id,
        ownerId: row.owner_id,
        sessionId: row.session_id,
        clientName: row.client_name,
        toolName: row.tool_name,
        title: row.title,
        summary: row.summary,
        state: row.state,
        payload: row.payload,
        patchDigest: row.patch_digest,
        mapUrl: row.map_url,
        expectedRevision: row.expected_revision === null ? null : toNumber(row.expected_revision),
        estimatedCostUsd:
            row.estimated_cost_usd === null
                ? null
                : typeof row.estimated_cost_usd === "number"
                  ? row.estimated_cost_usd
                  : Number.parseFloat(row.estimated_cost_usd),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        expiresAt: iso(row.expires_at),
        terminalMessage: row.terminal_message,
        result: row.result,
    };
}

function mapMcpApproval(row: McpApprovalRow): TeapotMcpApprovalRecord {
    return {
        id: row.id,
        proposalId: row.proposal_id,
        ownerId: row.owner_id,
        sessionId: row.session_id,
        toolName: row.tool_name,
        patchDigest: row.patch_digest,
        expectedRevision: row.expected_revision === null ? null : toNumber(row.expected_revision),
        tokenHash: row.token_hash,
        expiresAt: iso(row.expires_at),
        usedAt: nullableIso(row.used_at),
        createdAt: iso(row.created_at),
    };
}

function mapEndorsement(row: EndorsementRow): TeapotEndorsementRecord {
    return {
        id: row.id,
        candidateId: row.candidate_id,
        endorserId: row.endorser_id,
        state: row.state,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
    };
}

function mapOAuthState(row: OAuthStateRow): TeapotOAuthStateRecord {
    return {
        stateHash: row.state_hash,
        provider: row.provider,
        encryptedCodeVerifier: row.encrypted_code_verifier,
        redirectUri: row.redirect_uri,
        returnTo: row.return_to,
        expiresAt: iso(row.expires_at),
        consumedAt: nullableIso(row.consumed_at),
        createdAt: iso(row.created_at),
    };
}

function mapAdmissionLink(row: AdmissionLinkRow): TeapotAdmissionLinkRecord {
    return {
        id: row.id,
        candidateId: row.candidate_id,
        tokenHash: row.token_hash,
        expiresAt: iso(row.expires_at),
        revokedAt: nullableIso(row.revoked_at),
        createdAt: iso(row.created_at),
    };
}

function mapEndorsementIntent(row: EndorsementIntentRow): TeapotEndorsementIntentRecord {
    return {
        id: row.id,
        admissionLinkId: row.admission_link_id,
        candidateId: row.candidate_id,
        endorserId: row.endorser_id,
        tokenHash: row.token_hash,
        expiresAt: iso(row.expires_at),
        consumedAt: nullableIso(row.consumed_at),
        revokedAt: nullableIso(row.revoked_at),
        createdAt: iso(row.created_at),
    };
}

function mapAuditEvent(row: AuditEventRow): TeapotAuditEventRecord {
    return {
        id: row.id,
        actorId: row.actor_id,
        action: row.action,
        objectType: row.object_type,
        objectId: row.object_id,
        details: row.details,
        createdAt: iso(row.created_at),
    };
}
