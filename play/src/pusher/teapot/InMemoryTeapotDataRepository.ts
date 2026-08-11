/* eslint-disable @typescript-eslint/require-await -- synchronous in-memory implementation of a Promise-based repository contract */

import { randomUUID } from "node:crypto";

import type {
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
    TransitionTeapotMcpProposalInput,
    TeapotDataRepository,
} from "./TeapotDataRepository";
import type {
    TeapotAcceptedWokaRecord,
    TeapotAcceptedCatalogAssetRecord,
    TeapotActiveWokaSelectionRecord,
    TeapotAdmissionConfirmationRecord,
    TeapotAdmissionLinkRecord,
    TeapotAssetCatalog,
    TeapotAssetRecord,
    TeapotAuditEventRecord,
    TeapotCapabilityGrant,
    TeapotCatalogAssetRecord,
    TeapotDataExport,
    TeapotEndorsementRecord,
    TeapotEndorsementIntentRecord,
    TeapotMapRevisionRecord,
    TeapotMapWriterLease,
    TeapotMcpApprovalRecord,
    TeapotMcpProposalRecord,
    TeapotMcpSessionRecord,
    TeapotOAuthStateRecord,
    TeapotRoleAssignment,
} from "./TeapotRecords";

export interface InMemoryTeapotDataRepositoryOptions {
    createId?: () => string;
    now?: () => Date;
}

export class InMemoryTeapotDataRepository implements TeapotDataRepository {
    private readonly users = new Map<string, TeapotIdentity>();
    private readonly providerLinks = new Map<string, TeapotProviderLink>();
    private readonly roleAssignments = new Map<string, TeapotRoleAssignment>();
    private readonly capabilityGrants = new Map<string, TeapotCapabilityGrant>();
    private readonly catalogs = new Map<string, TeapotAssetCatalog>();
    private readonly assets = new Map<string, TeapotAssetRecord>();
    private readonly assetIdsByObjectReference = new Map<string, string>();
    private readonly catalogAssets = new Map<string, TeapotCatalogAssetRecord>();
    private readonly activeWokaSelections = new Map<string, TeapotActiveWokaSelectionRecord>();
    private readonly mapRevisions = new Map<string, TeapotMapRevisionRecord>();
    private readonly writerLeases = new Map<string, TeapotMapWriterLease>();
    private readonly mcpSessions = new Map<string, TeapotMcpSessionRecord>();
    private readonly mcpSessionIdsByTokenHash = new Map<string, string>();
    private readonly mcpProposals = new Map<string, TeapotMcpProposalRecord>();
    private readonly mcpApprovals = new Map<string, TeapotMcpApprovalRecord>();
    private readonly endorsements = new Map<string, TeapotEndorsementRecord>();
    private readonly oauthStates = new Map<string, TeapotOAuthStateRecord>();
    private readonly admissionLinks = new Map<string, TeapotAdmissionLinkRecord>();
    private readonly admissionLinkIdsByTokenHash = new Map<string, string>();
    private readonly endorsementIntents = new Map<string, TeapotEndorsementIntentRecord>();
    private readonly endorsementIntentIdsByTokenHash = new Map<string, string>();
    private readonly auditEvents = new Map<string, TeapotAuditEventRecord>();
    private readonly createId: () => string;
    private readonly now: () => Date;

    constructor(options: InMemoryTeapotDataRepositoryOptions = {}) {
        this.createId = options.createId ?? randomUUID;
        this.now = options.now ?? (() => new Date());
    }

    async resolveIdentity(input: ResolveTeapotIdentityInput): Promise<TeapotIdentity> {
        const providerKey = this.providerKey(input.provider, input.providerSubject);
        const existingLink = this.providerLinks.get(providerKey);
        if (existingLink !== undefined) {
            return this.requireIdentity(existingLink.userId);
        }

        const timestamp = this.nowIso();
        const identity: TeapotIdentity = {
            id: this.createId(),
            displayName: input.displayName ?? null,
            admissionState: "pending",
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        const providerLink: TeapotProviderLink = {
            userId: identity.id,
            provider: input.provider,
            providerSubject: input.providerSubject,
            createdAt: timestamp,
        };
        this.users.set(identity.id, identity);
        this.providerLinks.set(providerKey, providerLink);
        await this.addRole(identity.id, "member");
        return identity;
    }

    async getIdentity(userId: string): Promise<TeapotIdentity | null> {
        const identity = this.users.get(userId);
        return identity === undefined ? null : structuredClone(identity);
    }

    async updateAdmissionState(
        userId: string,
        admissionState: TeapotIdentity["admissionState"],
    ): Promise<TeapotIdentity> {
        const current = this.requireIdentity(userId);
        const updated: TeapotIdentity = {
            ...current,
            admissionState,
            updatedAt: this.nowIso(),
        };
        this.users.set(userId, updated);
        return structuredClone(updated);
    }

    async findProviderLink(provider: string, providerSubject: string): Promise<TeapotProviderLink | null> {
        return this.providerLinks.get(this.providerKey(provider, providerSubject)) ?? null;
    }

    async hasProviderLink(userId: string, provider: string): Promise<boolean> {
        return [...this.providerLinks.values()].some((link) => link.userId === userId && link.provider === provider);
    }

    async linkProvider(userId: string, provider: string, providerSubject: string): Promise<TeapotProviderLink> {
        this.requireIdentity(userId);
        const key = this.providerKey(provider, providerSubject);
        const existing = this.providerLinks.get(key);
        if (existing !== undefined) {
            if (existing.userId === userId) {
                return existing;
            }
            throw new TeapotDataConflictError(`Provider identity ${provider}:${providerSubject} is already linked`);
        }
        const link: TeapotProviderLink = {
            userId,
            provider,
            providerSubject,
            createdAt: this.nowIso(),
        };
        this.providerLinks.set(key, link);
        return link;
    }

    async addRole(userId: string, role: TeapotRole): Promise<void> {
        this.requireIdentity(userId);
        const key = `${userId}\u0000${role}`;
        if (!this.roleAssignments.has(key)) {
            this.roleAssignments.set(key, { userId, role, createdAt: this.nowIso() });
        }
    }

    async listRoles(userId: string): Promise<TeapotRole[]> {
        this.requireIdentity(userId);
        return [...this.roleAssignments.values()]
            .filter((assignment) => assignment.userId === userId)
            .map((assignment) => assignment.role)
            .sort();
    }

    async grantCapability(userId: string, capability: TeapotCapability): Promise<void> {
        this.requireIdentity(userId);
        const key = `${userId}\u0000${capability}`;
        if (!this.capabilityGrants.has(key)) {
            this.capabilityGrants.set(key, { userId, capability, createdAt: this.nowIso() });
        }
    }

    async listCapabilityGrants(userId: string): Promise<TeapotCapability[]> {
        this.requireIdentity(userId);
        return [...this.capabilityGrants.values()]
            .filter((grant) => grant.userId === userId)
            .map((grant) => grant.capability)
            .sort();
    }

    async createCatalog(input: CreateTeapotCatalogInput): Promise<TeapotAssetCatalog> {
        this.requireIdentity(input.ownerId);
        const timestamp = this.nowIso();
        const catalog: TeapotAssetCatalog = {
            id: this.createId(),
            ownerId: input.ownerId,
            kind: input.kind,
            name: input.name,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        this.catalogs.set(catalog.id, catalog);
        return catalog;
    }

    async getCatalog(catalogId: string): Promise<TeapotAssetCatalog | null> {
        return this.catalogs.get(catalogId) ?? null;
    }

    async createAsset(input: CreateTeapotAssetInput): Promise<TeapotAssetRecord> {
        this.requireIdentity(input.ownerId);
        if (this.assetIdsByObjectReference.has(input.objectReference)) {
            throw new TeapotDataConflictError(`Object reference ${input.objectReference} is already registered`);
        }
        const asset: TeapotAssetRecord = {
            id: this.createId(),
            ownerId: input.ownerId,
            objectReference: input.objectReference,
            kind: input.kind,
            mediaType: input.mediaType,
            metadata: input.metadata ?? {},
            published: input.published ?? false,
            createdAt: this.nowIso(),
            deletedAt: null,
        };
        this.assets.set(asset.id, asset);
        this.assetIdsByObjectReference.set(asset.objectReference, asset.id);
        return asset;
    }

    async getAsset(assetId: string): Promise<TeapotAssetRecord | null> {
        return this.assets.get(assetId) ?? null;
    }

    async addAssetToCatalog(catalogId: string, assetId: string, position: number): Promise<TeapotCatalogAssetRecord> {
        const catalog = this.catalogs.get(catalogId);
        const asset = this.assets.get(assetId);
        if (catalog === undefined || asset === undefined) {
            throw new TeapotDataNotFoundError("Catalog or asset does not exist");
        }
        if (catalog.ownerId !== asset.ownerId) {
            throw new TeapotDataConflictError("A catalog cannot contain another user's private asset");
        }
        const key = `${catalogId}\u0000${assetId}`;
        const existing = this.catalogAssets.get(key);
        if (existing !== undefined) {
            return existing;
        }
        const record: TeapotCatalogAssetRecord = { catalogId, assetId, position, createdAt: this.nowIso() };
        this.catalogAssets.set(key, record);
        return record;
    }

    async acceptWoka(input: AcceptTeapotWokaInput): Promise<TeapotAcceptedWokaRecord> {
        this.requireIdentity(input.ownerId);
        if (this.assetIdsByObjectReference.has(input.objectReference)) {
            throw new TeapotDataConflictError(`Object reference ${input.objectReference} is already registered`);
        }

        const timestamp = this.nowIso();
        let catalog = [...this.catalogs.values()].find(
            (candidate) => candidate.ownerId === input.ownerId && candidate.kind === "woka",
        );
        if (catalog === undefined) {
            catalog = {
                id: this.createId(),
                ownerId: input.ownerId,
                kind: "woka",
                name: "Generated Wokas",
                createdAt: timestamp,
                updatedAt: timestamp,
            };
        } else {
            catalog = { ...catalog, updatedAt: timestamp };
        }
        this.catalogs.set(catalog.id, catalog);

        const asset: TeapotAssetRecord = {
            id: this.createId(),
            ownerId: input.ownerId,
            objectReference: input.objectReference,
            kind: "woka",
            mediaType: "image/png",
            metadata: structuredClone(input.metadata),
            published: false,
            createdAt: timestamp,
            deletedAt: null,
        };
        this.assets.set(asset.id, asset);
        this.assetIdsByObjectReference.set(asset.objectReference, asset.id);

        const nextPosition =
            Math.max(
                -1,
                ...[...this.catalogAssets.values()]
                    .filter((membership) => membership.catalogId === catalog.id)
                    .map((membership) => membership.position),
            ) + 1;
        const membership: TeapotCatalogAssetRecord = {
            catalogId: catalog.id,
            assetId: asset.id,
            position: nextPosition,
            createdAt: timestamp,
        };
        this.catalogAssets.set(`${catalog.id}\u0000${asset.id}`, membership);

        const selection: TeapotActiveWokaSelectionRecord | null =
            readTeapotWokaCategory(input.metadata) === "woka"
                ? {
                      ownerId: input.ownerId,
                      assetId: asset.id,
                      updatedAt: timestamp,
                  }
                : null;
        if (selection !== null) {
            this.activeWokaSelections.set(input.ownerId, selection);
        }

        return structuredClone({ catalog, asset, membership, selection });
    }

    async acceptCatalogAsset(input: AcceptTeapotCatalogAssetInput): Promise<TeapotAcceptedCatalogAssetRecord> {
        this.requireIdentity(input.ownerId);
        if (this.assetIdsByObjectReference.has(input.objectReference)) {
            throw new TeapotDataConflictError(`Object reference ${input.objectReference} is already registered`);
        }
        const timestamp = this.nowIso();
        let catalog = [...this.catalogs.values()].find(
            (candidate) => candidate.ownerId === input.ownerId && candidate.kind === input.kind,
        );
        if (catalog === undefined) {
            catalog = {
                id: this.createId(),
                ownerId: input.ownerId,
                kind: input.kind,
                name: input.catalogName,
                createdAt: timestamp,
                updatedAt: timestamp,
            };
        } else {
            catalog = { ...catalog, updatedAt: timestamp };
        }
        this.catalogs.set(catalog.id, catalog);
        const asset: TeapotAssetRecord = {
            id: this.createId(),
            ownerId: input.ownerId,
            objectReference: input.objectReference,
            kind: input.kind,
            mediaType: input.mediaType,
            metadata: structuredClone(input.metadata ?? {}),
            published: input.published ?? false,
            createdAt: timestamp,
            deletedAt: null,
        };
        this.assets.set(asset.id, asset);
        this.assetIdsByObjectReference.set(asset.objectReference, asset.id);
        const nextPosition =
            Math.max(
                -1,
                ...[...this.catalogAssets.values()]
                    .filter((candidate) => candidate.catalogId === catalog.id)
                    .map((candidate) => candidate.position),
            ) + 1;
        const membership: TeapotCatalogAssetRecord = {
            catalogId: catalog.id,
            assetId: asset.id,
            position: nextPosition,
            createdAt: timestamp,
        };
        this.catalogAssets.set(`${catalog.id}\u0000${asset.id}`, membership);
        return structuredClone({ catalog, asset, membership });
    }

    async listAssets(ownerId: string, kind: TeapotAssetRecord["kind"]): Promise<TeapotAssetRecord[]> {
        this.requireIdentity(ownerId);
        return structuredClone(
            [...this.assets.values()]
                .filter((asset) => asset.ownerId === ownerId && asset.kind === kind && asset.deletedAt === null)
                .sort((left, right) => `${left.createdAt}:${left.id}`.localeCompare(`${right.createdAt}:${right.id}`)),
        );
    }

    async listWokas(ownerId: string): Promise<TeapotAssetRecord[]> {
        this.requireIdentity(ownerId);
        return structuredClone(
            [...this.assets.values()]
                .filter((asset) => asset.ownerId === ownerId && asset.kind === "woka" && asset.deletedAt === null)
                .sort((left, right) => `${left.createdAt}:${left.id}`.localeCompare(`${right.createdAt}:${right.id}`)),
        );
    }

    async getActiveWokaSelection(ownerId: string): Promise<TeapotActiveWokaSelectionRecord | null> {
        this.requireIdentity(ownerId);
        return structuredClone(this.activeWokaSelections.get(ownerId) ?? null);
    }

    async selectWoka(ownerId: string, assetId: string): Promise<TeapotActiveWokaSelectionRecord> {
        this.requireIdentity(ownerId);
        const asset = this.assets.get(assetId);
        if (
            asset === undefined ||
            asset.ownerId !== ownerId ||
            asset.kind !== "woka" ||
            readTeapotWokaCategory(asset.metadata) !== "woka" ||
            asset.deletedAt !== null
        ) {
            throw new TeapotDataNotFoundError(`Woka asset ${assetId} does not exist for this owner`);
        }
        const selection: TeapotActiveWokaSelectionRecord = {
            ownerId,
            assetId,
            updatedAt: this.nowIso(),
        };
        this.activeWokaSelections.set(ownerId, selection);
        return structuredClone(selection);
    }

    async deleteWoka(ownerId: string, assetId: string): Promise<TeapotAssetRecord> {
        this.requireIdentity(ownerId);
        const asset = this.assets.get(assetId);
        if (asset === undefined || asset.ownerId !== ownerId || asset.kind !== "woka" || asset.deletedAt !== null) {
            throw new TeapotDataNotFoundError(`Woka asset ${assetId} does not exist for this owner`);
        }
        const deletedAsset: TeapotAssetRecord = { ...asset, deletedAt: this.nowIso() };
        this.assets.set(asset.id, deletedAsset);
        if (this.activeWokaSelections.get(ownerId)?.assetId === assetId) {
            this.activeWokaSelections.delete(ownerId);
        }
        return structuredClone(deletedAsset);
    }

    async getMapRevision(mapId: string): Promise<TeapotMapRevisionRecord> {
        const existing = this.mapRevisions.get(mapId);
        if (existing !== undefined) {
            return existing;
        }
        const record: TeapotMapRevisionRecord = {
            mapId,
            revision: 0,
            lastObjectReference: null,
            updatedBy: null,
            updatedAt: this.nowIso(),
        };
        this.mapRevisions.set(mapId, record);
        return record;
    }

    async acquireMapWriterLease(input: AcquireTeapotMapWriterLeaseInput): Promise<TeapotMapWriterLease> {
        this.requireIdentity(input.writerId);
        const revision = await this.getMapRevision(input.mapId);
        if (revision.revision !== input.expectedRevision) {
            throw new TeapotMapRevisionConflictError(
                `Map ${input.mapId} is at revision ${revision.revision}, not ${input.expectedRevision}`,
            );
        }
        const now = this.now();
        const activeLease = this.writerLeases.get(input.mapId);
        if (activeLease !== undefined && Date.parse(activeLease.expiresAt) > now.getTime()) {
            throw new TeapotMapWriterLeaseConflictError(`Map ${input.mapId} already has an active writer`);
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
        this.writerLeases.set(input.mapId, lease);
        return lease;
    }

    async commitMapWriterLease(input: CommitTeapotMapWriterLeaseInput): Promise<TeapotMapRevisionRecord> {
        const lease = this.writerLeases.get(input.mapId);
        const now = this.now();
        if (
            lease === undefined ||
            lease.leaseToken !== input.leaseToken ||
            lease.writerId !== input.writerId ||
            Date.parse(lease.expiresAt) <= now.getTime()
        ) {
            throw new TeapotMapWriterLeaseConflictError(`Writer lease for map ${input.mapId} is missing or expired`);
        }
        const current = await this.getMapRevision(input.mapId);
        if (current.revision !== lease.expectedRevision) {
            throw new TeapotMapRevisionConflictError(`Map ${input.mapId} changed while the writer lease was active`);
        }
        const revision: TeapotMapRevisionRecord = {
            mapId: input.mapId,
            revision: current.revision + 1,
            lastObjectReference: input.objectReference ?? current.lastObjectReference,
            updatedBy: input.writerId,
            updatedAt: now.toISOString(),
        };
        this.mapRevisions.set(input.mapId, revision);
        this.writerLeases.delete(input.mapId);
        return revision;
    }

    async releaseMapWriterLease(mapId: string, leaseToken: string, writerId: string): Promise<void> {
        const lease = this.writerLeases.get(mapId);
        if (lease?.leaseToken === leaseToken && lease.writerId === writerId) {
            this.writerLeases.delete(mapId);
        }
    }

    async createMcpSession(input: CreateTeapotMcpSessionInput): Promise<TeapotMcpSessionRecord> {
        this.requireIdentity(input.ownerId);
        const session: TeapotMcpSessionRecord = {
            id: this.createId(),
            ownerId: input.ownerId,
            clientName: input.clientName,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            revokedAt: null,
            createdAt: this.nowIso(),
        };
        this.mcpSessions.set(session.id, session);
        this.mcpSessionIdsByTokenHash.set(session.tokenHash, session.id);
        return structuredClone(session);
    }

    async getMcpSession(sessionId: string): Promise<TeapotMcpSessionRecord | null> {
        const session = this.mcpSessions.get(sessionId);
        return session === undefined ? null : structuredClone(session);
    }

    async getMcpSessionByTokenHash(tokenHash: string): Promise<TeapotMcpSessionRecord | null> {
        const sessionId = this.mcpSessionIdsByTokenHash.get(tokenHash);
        if (sessionId === undefined) return null;
        return this.getMcpSession(sessionId);
    }

    async revokeMcpSession(
        sessionId: string,
        ownerId: string,
        revokedAt: string,
    ): Promise<TeapotMcpSessionRecord | null> {
        const session = this.mcpSessions.get(sessionId);
        if (session === undefined || session.ownerId !== ownerId || session.revokedAt !== null) return null;
        const revoked = { ...session, revokedAt };
        this.mcpSessions.set(sessionId, revoked);
        return structuredClone(revoked);
    }

    async createMcpProposal(input: CreateTeapotMcpProposalInput): Promise<TeapotMcpProposalRecord> {
        this.requireIdentity(input.ownerId);
        const session = this.mcpSessions.get(input.sessionId);
        if (
            session === undefined ||
            session.ownerId !== input.ownerId ||
            session.revokedAt !== null ||
            Date.parse(session.expiresAt) <= this.now().getTime()
        ) {
            throw new TeapotDataNotFoundError("The MCP session does not belong to this user");
        }
        const timestamp = this.nowIso();
        const proposal: TeapotMcpProposalRecord = {
            id: this.createId(),
            ownerId: input.ownerId,
            sessionId: input.sessionId,
            clientName: input.clientName,
            toolName: input.toolName,
            title: input.title,
            summary: input.summary,
            state: "pending",
            payload: structuredClone(input.payload),
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
        this.mcpProposals.set(proposal.id, proposal);
        return structuredClone(proposal);
    }

    async getMcpProposal(proposalId: string): Promise<TeapotMcpProposalRecord | null> {
        const proposal = this.mcpProposals.get(proposalId);
        return proposal === undefined ? null : structuredClone(proposal);
    }

    async listMcpProposals(ownerId: string, sessionId?: string): Promise<TeapotMcpProposalRecord[]> {
        return [...this.mcpProposals.values()]
            .filter(
                (proposal) =>
                    proposal.ownerId === ownerId && (sessionId === undefined || proposal.sessionId === sessionId),
            )
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .map((proposal) => structuredClone(proposal));
    }

    async transitionMcpProposal(input: TransitionTeapotMcpProposalInput): Promise<TeapotMcpProposalRecord | null> {
        const proposal = this.mcpProposals.get(input.proposalId);
        if (
            proposal === undefined ||
            proposal.ownerId !== input.ownerId ||
            (input.sessionId !== undefined && proposal.sessionId !== input.sessionId) ||
            !input.fromStates.includes(proposal.state)
        ) {
            return null;
        }
        const updated: TeapotMcpProposalRecord = {
            ...proposal,
            state: input.toState,
            terminalMessage: input.terminalMessage ?? proposal.terminalMessage,
            result: input.result === undefined ? proposal.result : structuredClone(input.result),
            updatedAt: this.nowIso(),
        };
        this.mcpProposals.set(updated.id, updated);
        return structuredClone(updated);
    }

    async approveMcpProposal(input: ApproveTeapotMcpProposalInput): Promise<TeapotMcpApprovalRecord | null> {
        const proposal = this.mcpProposals.get(input.proposalId);
        if (proposal === undefined || proposal.ownerId !== input.ownerId || proposal.state !== "pending") return null;
        if (this.mcpApprovals.has(input.proposalId)) return null;
        const timestamp = this.nowIso();
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
        this.mcpApprovals.set(proposal.id, approval);
        this.mcpProposals.set(proposal.id, { ...proposal, state: "approved", updatedAt: timestamp });
        return structuredClone(approval);
    }

    async getMcpApproval(proposalId: string): Promise<TeapotMcpApprovalRecord | null> {
        const approval = this.mcpApprovals.get(proposalId);
        return approval === undefined ? null : structuredClone(approval);
    }

    async consumeMcpApproval(input: ConsumeTeapotMcpApprovalInput): Promise<TeapotMcpApprovalRecord | null> {
        const approval = this.mcpApprovals.get(input.proposalId);
        const proposal = this.mcpProposals.get(input.proposalId);
        if (
            approval === undefined ||
            proposal === undefined ||
            approval.id !== input.approvalId ||
            approval.ownerId !== input.ownerId ||
            approval.sessionId !== input.sessionId ||
            approval.tokenHash !== input.tokenHash ||
            approval.usedAt !== null ||
            proposal.state !== "approved" ||
            Date.parse(approval.expiresAt) <= Date.parse(input.usedAt)
        ) {
            return null;
        }
        const consumed = { ...approval, usedAt: input.usedAt };
        this.mcpApprovals.set(input.proposalId, consumed);
        return structuredClone(consumed);
    }

    async createEndorsement(input: CreateTeapotEndorsementInput): Promise<TeapotEndorsementRecord> {
        const candidate = this.requireIdentity(input.candidateId);
        if (candidate.admissionState !== "pending") {
            throw new TeapotDataConflictError("Only pending candidates can create an admission link");
        }
        this.requireIdentity(input.endorserId);
        if (input.candidateId === input.endorserId) {
            throw new TeapotDataConflictError("A user cannot endorse themselves");
        }
        const key = `${input.candidateId}\u0000${input.endorserId}`;
        if (this.endorsements.has(key)) {
            throw new TeapotDataConflictError("This endorser already has an endorsement record for the candidate");
        }
        const timestamp = this.nowIso();
        const endorsement: TeapotEndorsementRecord = {
            id: this.createId(),
            candidateId: input.candidateId,
            endorserId: input.endorserId,
            state: input.state ?? "pending",
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        this.endorsements.set(key, endorsement);
        return endorsement;
    }

    async listEndorsements(candidateId: string): Promise<TeapotEndorsementRecord[]> {
        return [...this.endorsements.values()].filter((endorsement) => endorsement.candidateId === candidateId);
    }

    async createOAuthState(input: CreateTeapotOAuthStateInput): Promise<TeapotOAuthStateRecord> {
        if (this.oauthStates.has(input.stateHash)) {
            throw new TeapotDataConflictError("OAuth state already exists");
        }
        const record: TeapotOAuthStateRecord = {
            ...input,
            provider: "x",
            consumedAt: null,
            createdAt: this.nowIso(),
        };
        this.oauthStates.set(record.stateHash, record);
        return structuredClone(record);
    }

    async consumeOAuthState(stateHash: string, consumedAt: string): Promise<TeapotOAuthStateRecord | null> {
        const record = this.oauthStates.get(stateHash);
        if (
            record === undefined ||
            record.consumedAt !== null ||
            Date.parse(record.expiresAt) <= Date.parse(consumedAt)
        ) {
            return null;
        }
        const consumed = { ...record, consumedAt };
        this.oauthStates.set(stateHash, consumed);
        return structuredClone(consumed);
    }

    async createAdmissionLink(input: CreateTeapotAdmissionLinkInput): Promise<TeapotAdmissionLinkRecord> {
        this.requireIdentity(input.candidateId);
        if (this.admissionLinkIdsByTokenHash.has(input.tokenHash)) {
            throw new TeapotDataConflictError("Admission link token already exists");
        }
        const createdAt = this.nowIso();
        for (const [id, link] of this.admissionLinks) {
            if (link.candidateId === input.candidateId && link.revokedAt === null) {
                this.admissionLinks.set(id, { ...link, revokedAt: createdAt });
            }
        }
        const record: TeapotAdmissionLinkRecord = {
            id: this.createId(),
            candidateId: input.candidateId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            revokedAt: null,
            createdAt,
        };
        this.admissionLinks.set(record.id, record);
        this.admissionLinkIdsByTokenHash.set(record.tokenHash, record.id);
        return structuredClone(record);
    }

    async findAdmissionLinkByTokenHash(tokenHash: string): Promise<TeapotAdmissionLinkRecord | null> {
        const linkId = this.admissionLinkIdsByTokenHash.get(tokenHash);
        const record = linkId === undefined ? undefined : this.admissionLinks.get(linkId);
        return record === undefined ? null : structuredClone(record);
    }

    async revokeAdmissionLinks(candidateId: string, revokedAt: string): Promise<void> {
        for (const [id, link] of this.admissionLinks) {
            if (link.candidateId === candidateId && link.revokedAt === null) {
                this.admissionLinks.set(id, { ...link, revokedAt });
            }
        }
    }

    async createEndorsementIntent(input: CreateTeapotEndorsementIntentInput): Promise<TeapotEndorsementIntentRecord> {
        const candidate = this.requireIdentity(input.candidateId);
        const endorser = this.requireIdentity(input.endorserId);
        const link = this.admissionLinks.get(input.admissionLinkId);
        if (
            link === undefined ||
            link.candidateId !== input.candidateId ||
            link.revokedAt !== null ||
            Date.parse(link.expiresAt) <= this.now().getTime() ||
            candidate.admissionState !== "pending" ||
            endorser.admissionState !== "admitted" ||
            candidate.id === endorser.id
        ) {
            throw new TeapotDataConflictError("Admission link cannot be used for this endorsement");
        }
        if (this.endorsementIntentIdsByTokenHash.has(input.tokenHash)) {
            throw new TeapotDataConflictError("Endorsement confirmation token already exists");
        }
        const createdAt = this.nowIso();
        for (const [id, intent] of this.endorsementIntents) {
            if (
                intent.candidateId === input.candidateId &&
                intent.endorserId === input.endorserId &&
                intent.consumedAt === null &&
                intent.revokedAt === null &&
                Date.parse(intent.expiresAt) <= Date.parse(createdAt)
            ) {
                this.endorsementIntents.set(id, { ...intent, revokedAt: createdAt });
            }
        }
        if (
            [...this.endorsementIntents.values()].some(
                (intent) =>
                    intent.admissionLinkId === input.admissionLinkId &&
                    intent.endorserId === input.endorserId &&
                    intent.consumedAt === null &&
                    intent.revokedAt === null &&
                    Date.parse(intent.expiresAt) > Date.parse(createdAt),
            )
        ) {
            throw new TeapotDataConflictError("An endorsement confirmation is already pending");
        }
        const record: TeapotEndorsementIntentRecord = {
            id: this.createId(),
            ...input,
            consumedAt: null,
            revokedAt: null,
            createdAt,
        };
        this.endorsementIntents.set(record.id, record);
        this.endorsementIntentIdsByTokenHash.set(record.tokenHash, record.id);
        return structuredClone(record);
    }

    async confirmAdmissionEndorsement(
        input: ConfirmTeapotAdmissionEndorsementInput,
    ): Promise<TeapotAdmissionConfirmationRecord> {
        const intentId = this.endorsementIntentIdsByTokenHash.get(input.tokenHash);
        const intent = intentId === undefined ? undefined : this.endorsementIntents.get(intentId);
        if (
            intent === undefined ||
            intent.endorserId !== input.endorserId ||
            intent.consumedAt !== null ||
            intent.revokedAt !== null ||
            Date.parse(intent.expiresAt) <= Date.parse(input.confirmedAt)
        ) {
            throw new TeapotDataConflictError("Endorsement confirmation is invalid or expired");
        }
        const link = this.admissionLinks.get(intent.admissionLinkId);
        if (
            link === undefined ||
            link.candidateId !== intent.candidateId ||
            link.revokedAt !== null ||
            Date.parse(link.expiresAt) <= Date.parse(input.confirmedAt)
        ) {
            throw new TeapotDataConflictError("Admission link is invalid or expired");
        }
        const candidate = this.requireIdentity(intent.candidateId);
        const endorser = this.requireIdentity(intent.endorserId);
        if (candidate.admissionState !== "pending") {
            throw new TeapotDataConflictError("The candidate is not pending admission");
        }
        if (endorser.admissionState !== "admitted") {
            throw new TeapotDataConflictError("Only admitted users can endorse candidates");
        }
        if (candidate.id === endorser.id) {
            throw new TeapotDataConflictError("A user cannot endorse themselves");
        }

        const endorsement = await this.createEndorsement({
            candidateId: candidate.id,
            endorserId: endorser.id,
            state: "accepted",
        });
        this.endorsementIntents.set(intent.id, { ...intent, consumedAt: input.confirmedAt });
        const acceptedEndorsements = [...this.endorsements.values()].filter(
            (record) => record.candidateId === candidate.id && record.state === "accepted",
        ).length;
        const admittedNow = acceptedEndorsements >= input.requiredEndorsements;
        let updatedCandidate = candidate;
        if (admittedNow) {
            updatedCandidate = {
                ...candidate,
                admissionState: "admitted",
                updatedAt: input.confirmedAt,
            };
            this.users.set(candidate.id, updatedCandidate);
            await this.addRole(candidate.id, "creator");
            await this.revokeAdmissionLinks(candidate.id, input.confirmedAt);
        }
        return {
            endorsement: structuredClone(endorsement),
            candidate: structuredClone(updatedCandidate),
            acceptedEndorsements,
            admittedNow,
        };
    }

    async appendAuditEvent(input: AppendTeapotAuditEventInput): Promise<TeapotAuditEventRecord> {
        if (input.actorId !== undefined) {
            this.requireIdentity(input.actorId);
        }
        const event: TeapotAuditEventRecord = {
            id: this.createId(),
            actorId: input.actorId ?? null,
            action: input.action,
            objectType: input.objectType,
            objectId: input.objectId,
            details: input.details ?? {},
            createdAt: this.nowIso(),
        };
        this.auditEvents.set(event.id, event);
        return event;
    }

    async exportData(): Promise<TeapotDataExport> {
        return structuredClone({
            schemaVersion: 2,
            exportedAt: this.nowIso(),
            users: this.sorted(this.users.values(), (record) => record.id),
            providerLinks: this.sorted(this.providerLinks.values(), (record) =>
                this.providerKey(record.provider, record.providerSubject),
            ),
            roleAssignments: this.sorted(this.roleAssignments.values(), (record) => `${record.userId}:${record.role}`),
            capabilityGrants: this.sorted(
                this.capabilityGrants.values(),
                (record) => `${record.userId}:${record.capability}`,
            ),
            catalogs: this.sorted(this.catalogs.values(), (record) => record.id),
            assets: this.sorted(this.assets.values(), (record) => record.id),
            catalogAssets: this.sorted(
                this.catalogAssets.values(),
                (record) => `${record.catalogId}:${record.assetId}`,
            ),
            activeWokaSelections: this.sorted(this.activeWokaSelections.values(), (record) => record.ownerId),
            mapRevisions: this.sorted(this.mapRevisions.values(), (record) => record.mapId),
            writerLeases: this.sorted(this.writerLeases.values(), (record) => record.mapId),
            mcpSessions: this.sorted(this.mcpSessions.values(), (record) => record.id),
            mcpProposals: this.sorted(this.mcpProposals.values(), (record) => record.id),
            mcpApprovals: this.sorted(this.mcpApprovals.values(), (record) => record.id),
            endorsements: this.sorted(this.endorsements.values(), (record) => record.id),
            oauthStates: this.sorted(this.oauthStates.values(), (record) => record.stateHash),
            admissionLinks: this.sorted(this.admissionLinks.values(), (record) => record.id),
            endorsementIntents: this.sorted(this.endorsementIntents.values(), (record) => record.id),
            auditEvents: this.sorted(this.auditEvents.values(), (record) => record.id),
        });
    }

    async restoreData(data: TeapotDataExport): Promise<void> {
        if (data.schemaVersion !== 2) {
            throw new TeapotRestoreConflictError(`Unsupported Teapot export schema ${String(data.schemaVersion)}`);
        }
        if (!this.isEmpty()) {
            throw new TeapotRestoreConflictError("Teapot data can only be restored into an empty repository");
        }
        for (const selection of data.activeWokaSelections) {
            const asset = data.assets.find((candidate) => candidate.id === selection.assetId);
            if (
                asset === undefined ||
                asset.ownerId !== selection.ownerId ||
                asset.kind !== "woka" ||
                asset.deletedAt !== null
            ) {
                throw new TeapotRestoreConflictError(
                    `Active Woka selection for ${selection.ownerId} references an invalid asset`,
                );
            }
        }
        for (const user of data.users) this.users.set(user.id, structuredClone(user));
        for (const link of data.providerLinks)
            this.providerLinks.set(this.providerKey(link.provider, link.providerSubject), structuredClone(link));
        for (const role of data.roleAssignments)
            this.roleAssignments.set(`${role.userId}\u0000${role.role}`, structuredClone(role));
        for (const grant of data.capabilityGrants)
            this.capabilityGrants.set(`${grant.userId}\u0000${grant.capability}`, structuredClone(grant));
        for (const catalog of data.catalogs) this.catalogs.set(catalog.id, structuredClone(catalog));
        for (const asset of data.assets) {
            this.assets.set(asset.id, structuredClone(asset));
            this.assetIdsByObjectReference.set(asset.objectReference, asset.id);
        }
        for (const record of data.catalogAssets)
            this.catalogAssets.set(`${record.catalogId}\u0000${record.assetId}`, structuredClone(record));
        for (const selection of data.activeWokaSelections) {
            this.activeWokaSelections.set(selection.ownerId, structuredClone(selection));
        }
        for (const revision of data.mapRevisions) this.mapRevisions.set(revision.mapId, structuredClone(revision));
        for (const lease of data.writerLeases) this.writerLeases.set(lease.mapId, structuredClone(lease));
        for (const session of data.mcpSessions) {
            this.mcpSessions.set(session.id, structuredClone(session));
            this.mcpSessionIdsByTokenHash.set(session.tokenHash, session.id);
        }
        for (const proposal of data.mcpProposals) this.mcpProposals.set(proposal.id, structuredClone(proposal));
        for (const approval of data.mcpApprovals) {
            this.mcpApprovals.set(approval.proposalId, structuredClone(approval));
        }
        for (const endorsement of data.endorsements)
            this.endorsements.set(
                `${endorsement.candidateId}\u0000${endorsement.endorserId}`,
                structuredClone(endorsement),
            );
        for (const state of data.oauthStates) this.oauthStates.set(state.stateHash, structuredClone(state));
        for (const link of data.admissionLinks) {
            this.admissionLinks.set(link.id, structuredClone(link));
            this.admissionLinkIdsByTokenHash.set(link.tokenHash, link.id);
        }
        for (const intent of data.endorsementIntents) {
            this.endorsementIntents.set(intent.id, structuredClone(intent));
            this.endorsementIntentIdsByTokenHash.set(intent.tokenHash, intent.id);
        }
        for (const event of data.auditEvents) this.auditEvents.set(event.id, structuredClone(event));
    }

    private requireIdentity(userId: string): TeapotIdentity {
        const identity = this.users.get(userId);
        if (identity === undefined) {
            throw new TeapotDataNotFoundError(`Teapot user ${userId} does not exist`);
        }
        return identity;
    }

    private providerKey(provider: string, providerSubject: string): string {
        return `${provider}\u0000${providerSubject}`;
    }

    private nowIso(): string {
        return this.now().toISOString();
    }

    private sorted<T>(values: Iterable<T>, key: (value: T) => string): T[] {
        return [...values].sort((left, right) => key(left).localeCompare(key(right)));
    }

    private isEmpty(): boolean {
        return (
            this.users.size === 0 &&
            this.providerLinks.size === 0 &&
            this.roleAssignments.size === 0 &&
            this.capabilityGrants.size === 0 &&
            this.catalogs.size === 0 &&
            this.assets.size === 0 &&
            this.catalogAssets.size === 0 &&
            this.activeWokaSelections.size === 0 &&
            this.mapRevisions.size === 0 &&
            this.writerLeases.size === 0 &&
            this.mcpSessions.size === 0 &&
            this.mcpProposals.size === 0 &&
            this.mcpApprovals.size === 0 &&
            this.endorsements.size === 0 &&
            this.oauthStates.size === 0 &&
            this.admissionLinks.size === 0 &&
            this.endorsementIntents.size === 0 &&
            this.auditEvents.size === 0
        );
    }
}
