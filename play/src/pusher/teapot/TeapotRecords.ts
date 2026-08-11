import type {
    TeapotCapability,
    TeapotIdentity,
    TeapotProviderLink,
    TeapotRole,
} from "../../common/Teapot/TeapotIdentity";

export type TeapotJsonValue = string | number | boolean | null | TeapotJsonValue[] | { [key: string]: TeapotJsonValue };

export type TeapotAssetKind = "woka" | "woka-part" | "map-entity" | "tileset" | "reference";

export interface TeapotAssetCatalog {
    id: string;
    ownerId: string;
    kind: TeapotAssetKind;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface TeapotAssetRecord {
    id: string;
    ownerId: string;
    objectReference: string;
    kind: TeapotAssetKind;
    mediaType: string;
    metadata: TeapotJsonValue;
    published: boolean;
    createdAt: string;
    deletedAt: string | null;
}

export interface TeapotCatalogAssetRecord {
    catalogId: string;
    assetId: string;
    position: number;
    createdAt: string;
}

export interface TeapotActiveWokaSelectionRecord {
    ownerId: string;
    assetId: string;
    updatedAt: string;
}

export interface TeapotAcceptedWokaRecord {
    catalog: TeapotAssetCatalog;
    asset: TeapotAssetRecord;
    membership: TeapotCatalogAssetRecord;
    selection: TeapotActiveWokaSelectionRecord | null;
}

export interface TeapotAcceptedCatalogAssetRecord {
    catalog: TeapotAssetCatalog;
    asset: TeapotAssetRecord;
    membership: TeapotCatalogAssetRecord;
}

export type TeapotMapMutationSource = "wam" | "tmj" | "mcp";

export interface TeapotMapRevisionRecord {
    mapId: string;
    revision: number;
    lastObjectReference: string | null;
    updatedBy: string | null;
    updatedAt: string;
}

export interface TeapotMapWriterLease {
    mapId: string;
    leaseToken: string;
    writerId: string;
    expectedRevision: number;
    source: TeapotMapMutationSource;
    expiresAt: string;
    createdAt: string;
}

export const TEAPOT_ROOM_ACCESS_MODES = ["everyone", "specific", "nobody"] as const;
export const TEAPOT_ROOM_ACCESS_ROLES = ["view", "edit", "admin"] as const;

export type TeapotRoomAccessMode = (typeof TEAPOT_ROOM_ACCESS_MODES)[number];
export type TeapotRoomAccessRole = (typeof TEAPOT_ROOM_ACCESS_ROLES)[number];

export interface TeapotRoomAccessPolicyRecord {
    mapId: string;
    role: TeapotRoomAccessRole;
    mode: TeapotRoomAccessMode;
    version: number;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TeapotRoomAccessGrantRecord {
    mapId: string;
    role: TeapotRoomAccessRole;
    userId: string;
    grantedBy: string | null;
    createdAt: string;
}

export interface TeapotRoomAccessRecord {
    policy: TeapotRoomAccessPolicyRecord;
    grants: TeapotRoomAccessGrantRecord[];
}

export interface TeapotRoomVisitorRecord {
    mapId: string;
    userId: string;
    firstVisitedAt: string;
    lastVisitedAt: string;
    visitCount: number;
}

/** Backward-compatible editor aliases for the first room-access API revision. */
export type TeapotRoomEditorMode = TeapotRoomAccessMode;
export type TeapotRoomEditorPolicyRecord = TeapotRoomAccessPolicyRecord;
export type TeapotRoomEditorGrantRecord = TeapotRoomAccessGrantRecord;
export type TeapotRoomEditorAccessRecord = TeapotRoomAccessRecord;

export interface TeapotMcpSessionRecord {
    id: string;
    ownerId: string;
    clientName: string;
    tokenHash: string;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
}

export type TeapotMcpProposalState = "pending" | "approved" | "denied" | "expired" | "stale" | "applied" | "failed";

export interface TeapotMcpProposalRecord {
    id: string;
    ownerId: string;
    sessionId: string;
    clientName: string;
    toolName: string;
    title: string;
    summary: string;
    state: TeapotMcpProposalState;
    payload: TeapotJsonValue;
    patchDigest: string;
    mapUrl: string | null;
    expectedRevision: number | null;
    estimatedCostUsd: number | null;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    terminalMessage: string | null;
    result: TeapotJsonValue | null;
}

export interface TeapotMcpApprovalRecord {
    id: string;
    proposalId: string;
    ownerId: string;
    sessionId: string;
    toolName: string;
    patchDigest: string;
    expectedRevision: number | null;
    tokenHash: string;
    expiresAt: string;
    usedAt: string | null;
    createdAt: string;
}

export interface TeapotApprovedMcpProposalRecord {
    proposal: TeapotMcpProposalRecord;
    approval: TeapotMcpApprovalRecord;
}

export type TeapotEndorsementState = "pending" | "accepted" | "revoked";

export interface TeapotEndorsementRecord {
    id: string;
    candidateId: string;
    endorserId: string;
    state: TeapotEndorsementState;
    createdAt: string;
    updatedAt: string;
}

export interface TeapotOAuthStateRecord {
    stateHash: string;
    provider: "x";
    encryptedCodeVerifier: string;
    redirectUri: string;
    returnTo: string;
    expiresAt: string;
    consumedAt: string | null;
    createdAt: string;
}

export interface TeapotAdmissionLinkRecord {
    id: string;
    candidateId: string;
    tokenHash: string;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
}

export interface TeapotEndorsementIntentRecord {
    id: string;
    admissionLinkId: string;
    candidateId: string;
    endorserId: string;
    tokenHash: string;
    expiresAt: string;
    consumedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
}

export interface TeapotAdmissionConfirmationRecord {
    endorsement: TeapotEndorsementRecord;
    candidate: TeapotIdentity;
    acceptedEndorsements: number;
    admittedNow: boolean;
}

export interface TeapotAuditEventRecord {
    id: string;
    actorId: string | null;
    action: string;
    objectType: string;
    objectId: string;
    details: TeapotJsonValue;
    createdAt: string;
}

export interface TeapotRoleAssignment {
    userId: string;
    role: TeapotRole;
    createdAt: string;
}

export interface TeapotCapabilityGrant {
    userId: string;
    capability: TeapotCapability;
    createdAt: string;
}

export interface TeapotDataExport {
    schemaVersion: 2 | 3 | 4;
    exportedAt: string;
    users: TeapotIdentity[];
    providerLinks: TeapotProviderLink[];
    roleAssignments: TeapotRoleAssignment[];
    capabilityGrants: TeapotCapabilityGrant[];
    catalogs: TeapotAssetCatalog[];
    assets: TeapotAssetRecord[];
    catalogAssets: TeapotCatalogAssetRecord[];
    activeWokaSelections: TeapotActiveWokaSelectionRecord[];
    mapRevisions: TeapotMapRevisionRecord[];
    writerLeases: TeapotMapWriterLease[];
    roomEditorPolicies?: TeapotRoomEditorPolicyRecord[];
    roomEditorGrants?: TeapotRoomEditorGrantRecord[];
    roomAccessPolicies?: TeapotRoomAccessPolicyRecord[];
    roomAccessGrants?: TeapotRoomAccessGrantRecord[];
    roomVisitors?: TeapotRoomVisitorRecord[];
    mcpSessions: TeapotMcpSessionRecord[];
    mcpProposals: TeapotMcpProposalRecord[];
    mcpApprovals: TeapotMcpApprovalRecord[];
    endorsements: TeapotEndorsementRecord[];
    oauthStates: TeapotOAuthStateRecord[];
    admissionLinks: TeapotAdmissionLinkRecord[];
    endorsementIntents: TeapotEndorsementIntentRecord[];
    auditEvents: TeapotAuditEventRecord[];
}

export interface TeapotOwnedRecord {
    ownerId: string;
}
