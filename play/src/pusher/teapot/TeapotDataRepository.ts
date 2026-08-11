import type {
    TeapotCapability,
    TeapotIdentity,
    TeapotProviderLink,
    TeapotRole,
} from "../../common/Teapot/TeapotIdentity";
import type {
    TeapotAssetCatalog,
    TeapotAssetKind,
    TeapotAssetRecord,
    TeapotAcceptedWokaRecord,
    TeapotAcceptedCatalogAssetRecord,
    TeapotActiveWokaSelectionRecord,
    TeapotAdmissionConfirmationRecord,
    TeapotAdmissionLinkRecord,
    TeapotAuditEventRecord,
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
    TeapotRoomEditorMode,
    TeapotRoomEditorPolicyRecord,
} from "./TeapotRecords";

export interface ResolveTeapotIdentityInput {
    provider: string;
    providerSubject: string;
    displayName?: string;
}

export interface CreateTeapotCatalogInput {
    ownerId: string;
    kind: TeapotAssetKind;
    name: string;
}

export interface CreateTeapotAssetInput {
    ownerId: string;
    objectReference: string;
    kind: TeapotAssetKind;
    mediaType: string;
    metadata?: TeapotJsonValue;
    published?: boolean;
}

export interface AcceptTeapotWokaInput {
    ownerId: string;
    objectReference: string;
    metadata: TeapotJsonValue;
}

export interface AcceptTeapotCatalogAssetInput extends CreateTeapotAssetInput {
    catalogName: string;
}

export interface AcquireTeapotMapWriterLeaseInput {
    mapId: string;
    writerId: string;
    expectedRevision: number;
    source: TeapotMapMutationSource;
    ttlMs: number;
}

export interface CommitTeapotMapWriterLeaseInput {
    mapId: string;
    leaseToken: string;
    writerId: string;
    objectReference?: string;
}

export interface ReplaceTeapotRoomEditorPolicyInput {
    mapId: string;
    mode: TeapotRoomEditorMode;
    expectedVersion: number | null;
    editorIds: string[];
    actorId: string;
}

export interface CreateTeapotMcpSessionInput {
    ownerId: string;
    clientName: string;
    tokenHash: string;
    expiresAt: string;
}

export interface CreateTeapotMcpProposalInput {
    ownerId: string;
    sessionId: string;
    clientName: string;
    toolName: string;
    title: string;
    summary: string;
    payload: TeapotJsonValue;
    patchDigest: string;
    mapUrl?: string;
    expectedRevision?: number;
    estimatedCostUsd?: number;
    expiresAt: string;
}

export interface TransitionTeapotMcpProposalInput {
    proposalId: string;
    ownerId: string;
    sessionId?: string;
    fromStates: TeapotMcpProposalState[];
    toState: TeapotMcpProposalState;
    terminalMessage?: string;
    result?: TeapotJsonValue;
}

export interface ApproveTeapotMcpProposalInput {
    proposalId: string;
    ownerId: string;
    approvalId: string;
    tokenHash: string;
    expiresAt: string;
}

export interface ConsumeTeapotMcpApprovalInput {
    approvalId: string;
    proposalId: string;
    ownerId: string;
    sessionId: string;
    tokenHash: string;
    usedAt: string;
}

export interface CreateTeapotEndorsementInput {
    candidateId: string;
    endorserId: string;
    state?: TeapotEndorsementState;
}

export interface CreateTeapotOAuthStateInput {
    stateHash: string;
    encryptedCodeVerifier: string;
    redirectUri: string;
    returnTo: string;
    expiresAt: string;
}

export interface CreateTeapotAdmissionLinkInput {
    candidateId: string;
    tokenHash: string;
    expiresAt: string;
}

export interface CreateTeapotEndorsementIntentInput {
    admissionLinkId: string;
    candidateId: string;
    endorserId: string;
    tokenHash: string;
    expiresAt: string;
}

export interface ConfirmTeapotAdmissionEndorsementInput {
    tokenHash: string;
    endorserId: string;
    confirmedAt: string;
    requiredEndorsements: number;
}

export interface AppendTeapotAuditEventInput {
    actorId?: string;
    action: string;
    objectType: string;
    objectId: string;
    details?: TeapotJsonValue;
}

/**
 * Owner-aware application-record boundary shared by avatar, map editor, MCP, and admission services.
 * Binary bytes never cross this interface; records point to immutable map-storage object references.
 */
export interface TeapotDataRepository {
    resolveIdentity(input: ResolveTeapotIdentityInput): Promise<TeapotIdentity>;
    getIdentity(userId: string): Promise<TeapotIdentity | null>;
    updateAdmissionState(userId: string, admissionState: TeapotIdentity["admissionState"]): Promise<TeapotIdentity>;
    findProviderLink(provider: string, providerSubject: string): Promise<TeapotProviderLink | null>;
    findProviderLinkForUser(userId: string, provider: string): Promise<TeapotProviderLink | null>;
    hasProviderLink(userId: string, provider: string): Promise<boolean>;
    linkProvider(userId: string, provider: string, providerSubject: string): Promise<TeapotProviderLink>;

    addRole(userId: string, role: TeapotRole): Promise<void>;
    listRoles(userId: string): Promise<TeapotRole[]>;
    grantCapability(userId: string, capability: TeapotCapability): Promise<void>;
    listCapabilityGrants(userId: string): Promise<TeapotCapability[]>;

    createCatalog(input: CreateTeapotCatalogInput): Promise<TeapotAssetCatalog>;
    getCatalog(catalogId: string): Promise<TeapotAssetCatalog | null>;
    createAsset(input: CreateTeapotAssetInput): Promise<TeapotAssetRecord>;
    getAsset(assetId: string): Promise<TeapotAssetRecord | null>;
    addAssetToCatalog(catalogId: string, assetId: string, position: number): Promise<TeapotCatalogAssetRecord>;
    acceptWoka(input: AcceptTeapotWokaInput): Promise<TeapotAcceptedWokaRecord>;
    acceptCatalogAsset(input: AcceptTeapotCatalogAssetInput): Promise<TeapotAcceptedCatalogAssetRecord>;
    listAssets(ownerId: string, kind: TeapotAssetKind): Promise<TeapotAssetRecord[]>;
    listWokas(ownerId: string): Promise<TeapotAssetRecord[]>;
    getActiveWokaSelection(ownerId: string): Promise<TeapotActiveWokaSelectionRecord | null>;
    selectWoka(ownerId: string, assetId: string): Promise<TeapotActiveWokaSelectionRecord>;
    deleteWoka(ownerId: string, assetId: string): Promise<TeapotAssetRecord>;

    getMapRevision(mapId: string): Promise<TeapotMapRevisionRecord>;
    acquireMapWriterLease(input: AcquireTeapotMapWriterLeaseInput): Promise<TeapotMapWriterLease>;
    commitMapWriterLease(input: CommitTeapotMapWriterLeaseInput): Promise<TeapotMapRevisionRecord>;
    releaseMapWriterLease(mapId: string, leaseToken: string, writerId: string): Promise<void>;
    getRoomEditorPolicy(mapId: string): Promise<TeapotRoomEditorPolicyRecord | null>;
    listRoomEditorGrants(mapId: string): Promise<TeapotRoomEditorGrantRecord[]>;
    replaceRoomEditorPolicy(input: ReplaceTeapotRoomEditorPolicyInput): Promise<TeapotRoomEditorAccessRecord>;

    createMcpSession(input: CreateTeapotMcpSessionInput): Promise<TeapotMcpSessionRecord>;
    getMcpSession(sessionId: string): Promise<TeapotMcpSessionRecord | null>;
    getMcpSessionByTokenHash(tokenHash: string): Promise<TeapotMcpSessionRecord | null>;
    revokeMcpSession(sessionId: string, ownerId: string, revokedAt: string): Promise<TeapotMcpSessionRecord | null>;
    createMcpProposal(input: CreateTeapotMcpProposalInput): Promise<TeapotMcpProposalRecord>;
    getMcpProposal(proposalId: string): Promise<TeapotMcpProposalRecord | null>;
    listMcpProposals(ownerId: string, sessionId?: string): Promise<TeapotMcpProposalRecord[]>;
    transitionMcpProposal(input: TransitionTeapotMcpProposalInput): Promise<TeapotMcpProposalRecord | null>;
    approveMcpProposal(input: ApproveTeapotMcpProposalInput): Promise<TeapotMcpApprovalRecord | null>;
    getMcpApproval(proposalId: string): Promise<TeapotMcpApprovalRecord | null>;
    consumeMcpApproval(input: ConsumeTeapotMcpApprovalInput): Promise<TeapotMcpApprovalRecord | null>;
    createEndorsement(input: CreateTeapotEndorsementInput): Promise<TeapotEndorsementRecord>;
    listEndorsements(candidateId: string): Promise<TeapotEndorsementRecord[]>;
    createOAuthState(input: CreateTeapotOAuthStateInput): Promise<TeapotOAuthStateRecord>;
    consumeOAuthState(stateHash: string, consumedAt: string): Promise<TeapotOAuthStateRecord | null>;
    createAdmissionLink(input: CreateTeapotAdmissionLinkInput): Promise<TeapotAdmissionLinkRecord>;
    findAdmissionLinkByTokenHash(tokenHash: string): Promise<TeapotAdmissionLinkRecord | null>;
    revokeAdmissionLinks(candidateId: string, revokedAt: string): Promise<void>;
    createEndorsementIntent(input: CreateTeapotEndorsementIntentInput): Promise<TeapotEndorsementIntentRecord>;
    confirmAdmissionEndorsement(
        input: ConfirmTeapotAdmissionEndorsementInput,
    ): Promise<TeapotAdmissionConfirmationRecord>;
    appendAuditEvent(input: AppendTeapotAuditEventInput): Promise<TeapotAuditEventRecord>;

    exportData(): Promise<TeapotDataExport>;
    restoreData(data: TeapotDataExport): Promise<void>;
}
