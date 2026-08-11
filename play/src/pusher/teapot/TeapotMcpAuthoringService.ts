import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
    TEAPOT_AUTHORING_VOCABULARY,
    TeapotMapPatch,
    TeapotMcpProposalPayload,
    TeapotPaidGenerationRequest,
    TeapotPaidGenerationCompletionResult,
    digestCanonicalJson,
    validateTeapotPatchContract,
} from "@workadventure/teapot-mcp/contracts";
import type {
    TeapotMcpProposal as PublicTeapotMcpProposal,
    TeapotMcpProposalState as PublicTeapotMcpProposalState,
    TeapotPaidGenerationClaim,
    TeapotPaidGenerationCompletionResult as TeapotPaidGenerationCompletionResultType,
    TeapotPatchValidation,
} from "@workadventure/teapot-mcp/contracts";
import * as z from "zod/v4";

import { readTeapotWokaCategory } from "../../common/Teapot/TeapotWoka";
import {
    TEAPOT_MCP_APPROVAL_SECRET,
    TEAPOT_MCP_PUBLIC_URL,
    TEAPOT_WOKA_PUBLIC_BASE_URL,
} from "../enums/EnvironmentVariable";
import { TeapotAuthorizationError, TeapotMapRevisionConflictError } from "./TeapotDataErrors";
import type {
    TeapotAssetKind,
    TeapotAssetRecord,
    TeapotJsonValue,
    TeapotMcpProposalRecord,
    TeapotMcpSessionRecord,
} from "./TeapotRecords";
import { teapotMapPublicationService } from "./TeapotMapPublicationService";
import { getTeapotDataServices } from "./TeapotDataRuntime";
import { compileTeapotMapPatch, resolveTeapotTilesetImports, summarizeTeapotMap } from "./TeapotSemanticPatchCompiler";
import { generateOpaqueToken, hashOpaqueToken } from "./TeapotTokenSecurity";

const SESSION_TTL_MS = 2 * 60 * 60 * 1_000;
const PROPOSAL_TTL_MS = 30 * 60 * 1_000;
const APPROVAL_TTL_MS = 10 * 60 * 1_000;

const ApprovalTokenPayload = z
    .object({
        version: z.literal(1),
        approvalId: z.string().uuid(),
        proposalId: z.string().uuid(),
        ownerId: z.string().uuid(),
        sessionId: z.string().uuid(),
        toolName: z.string().min(1).max(120),
        patchDigest: z.string().regex(/^[a-f0-9]{64}$/),
        expectedRevision: z.number().int().nonnegative().nullable(),
        expiresAt: z.string().datetime(),
    })
    .strict();

type ApprovalTokenPayload = z.infer<typeof ApprovalTokenPayload>;
type AcceptedPaidAssetResult = Extract<TeapotPaidGenerationCompletionResultType, { status: "accepted-asset" }>;

export interface TeapotMcpSessionCredential {
    sessionId: string;
    bearerToken: string;
    clientName: string;
    expiresAt: string;
    mcpEndpoint: string;
}

export interface TeapotMcpSessionContext {
    sessionId: string;
    ownerId: string;
    clientName: string;
    expiresAt: string;
}

export interface TeapotMcpProposalWithApproval extends PublicTeapotMcpProposal {
    approvalToken?: string;
}

export class TeapotMcpAuthoringService {
    async createSession(ownerId: string, clientName: string): Promise<TeapotMcpSessionCredential> {
        await getTeapotDataServices().authorization.assertCapability(ownerId, "mcp.connect");
        const bearerToken = generateOpaqueToken(32);
        const session = await getTeapotDataServices().repository.createMcpSession({
            ownerId,
            clientName,
            tokenHash: hashOpaqueToken(bearerToken),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        });
        await this.audit(ownerId, "mcp.session.created", "mcp-session", session.id, { clientName });
        return {
            sessionId: session.id,
            bearerToken,
            clientName: session.clientName,
            expiresAt: session.expiresAt,
            mcpEndpoint: TEAPOT_MCP_PUBLIC_URL,
        };
    }

    async revokeSession(ownerId: string, sessionId: string): Promise<void> {
        const revoked = await getTeapotDataServices().repository.revokeMcpSession(
            sessionId,
            ownerId,
            new Date().toISOString(),
        );
        if (revoked === null) throw new TeapotMcpAuthoringError("MCP session not found", 404);
        const proposals = await getTeapotDataServices().repository.listMcpProposals(ownerId, sessionId);
        await Promise.all(
            proposals
                .filter((proposal) => proposal.state === "pending" || proposal.state === "approved")
                .map((proposal) =>
                    this.transition(proposal, "expired", "MCP session was revoked", ["pending", "approved"]),
                ),
        );
        await this.audit(ownerId, "mcp.session.revoked", "mcp-session", sessionId, {});
    }

    async authenticateToken(bearerToken: string): Promise<TeapotMcpSessionContext> {
        const session = await getTeapotDataServices().repository.getMcpSessionByTokenHash(hashOpaqueToken(bearerToken));
        this.assertLiveSession(session);
        return this.toSessionContext(session);
    }

    capabilities(): typeof TEAPOT_AUTHORING_VOCABULARY {
        return TEAPOT_AUTHORING_VOCABULARY;
    }

    async mapSummary(session: TeapotMcpSessionContext, mapUrl: string) {
        await getTeapotDataServices().authorization.assertCapability(session.ownerId, "map.edit");
        const [revision, map] = await Promise.all([
            teapotMapPublicationService.currentRevision(mapUrl),
            teapotMapPublicationService.readMap(mapUrl),
        ]);
        return summarizeTeapotMap(mapUrl, revision.revision, map);
    }

    async validateMapPatch(session: TeapotMcpSessionContext, uncheckedPatch: unknown): Promise<TeapotPatchValidation> {
        await getTeapotDataServices().authorization.assertCapability(session.ownerId, "map.edit");
        const parsed = TeapotMapPatch.safeParse(uncheckedPatch);
        if (!parsed.success) throw new TeapotMcpAuthoringError("The structured map patch is invalid", 400);
        const [revision, map] = await Promise.all([
            teapotMapPublicationService.currentRevision(parsed.data.mapUrl),
            teapotMapPublicationService.readMap(parsed.data.mapUrl),
        ]);
        if (revision.revision !== parsed.data.expectedRevision) {
            throw new TeapotMcpAuthoringError(
                `The map is now at revision ${revision.revision}; refresh the summary and draft again`,
                409,
            );
        }
        const resolvedTilesets = await resolveTeapotTilesetImports(
            getTeapotDataServices().repository,
            session.ownerId,
            parsed.data,
            TEAPOT_WOKA_PUBLIC_BASE_URL,
        );
        const compiled = compileTeapotMapPatch(map, parsed.data, resolvedTilesets);
        const contract = validateTeapotPatchContract(parsed.data);
        return { ...contract, summary: compiled.summary, importedTilesets: compiled.importedTilesets };
    }

    async createMapPatchProposal(
        session: TeapotMcpSessionContext,
        uncheckedPatch: unknown,
    ): Promise<PublicTeapotMcpProposal> {
        const parsed = TeapotMapPatch.safeParse(uncheckedPatch);
        if (!parsed.success) throw new TeapotMcpAuthoringError("The structured map patch is invalid", 400);
        const validation = await this.validateMapPatch(session, parsed.data);
        return this.createProposal(session, {
            toolName: "teapot_propose_map_patch",
            title: parsed.data.title,
            summary: validation.summary,
            payload: { kind: "map-patch", patch: parsed.data },
            patchDigest: validation.digest,
            mapUrl: parsed.data.mapUrl,
            expectedRevision: parsed.data.expectedRevision,
        });
    }

    async createPaidGenerationProposal(
        session: TeapotMcpSessionContext,
        uncheckedRequest: unknown,
    ): Promise<PublicTeapotMcpProposal> {
        await getTeapotDataServices().authorization.assertCapability(session.ownerId, "asset.create");
        const parsed = TeapotPaidGenerationRequest.safeParse(uncheckedRequest);
        if (!parsed.success) throw new TeapotMcpAuthoringError("The paid generation request is invalid", 400);
        return this.createProposal(session, {
            toolName: "teapot_propose_paid_generation",
            title: `Generate ${parsed.data.targetAssetClass}`,
            summary: `${parsed.data.purpose} image generation: ${parsed.data.prompt}`.slice(0, 4_000),
            payload: { kind: "paid-asset-generation", request: parsed.data },
            patchDigest: digestCanonicalJson(parsed.data),
            estimatedCostUsd: parsed.data.estimatedMaximumCostUsd,
        });
    }

    async createUndoProposal(
        session: TeapotMcpSessionContext,
        input: {
            mapUrl: string;
            expectedRevision: number;
            previousRevisionUrl: string;
            title: string;
            rationale: string;
        },
    ): Promise<PublicTeapotMcpProposal> {
        await getTeapotDataServices().authorization.assertCapability(session.ownerId, "map.publish");
        const current = await teapotMapPublicationService.currentRevision(input.mapUrl);
        if (current.revision !== input.expectedRevision) {
            throw new TeapotMcpAuthoringError(`The map is now at revision ${current.revision}`, 409);
        }
        const payload = { kind: "undo-map-publication" as const, ...input };
        return this.createProposal(session, {
            toolName: "teapot_propose_undo",
            title: input.title,
            summary: `Restore ${input.previousRevisionUrl}. ${input.rationale}`.slice(0, 4_000),
            payload,
            patchDigest: digestCanonicalJson(payload),
            mapUrl: input.mapUrl,
            expectedRevision: input.expectedRevision,
        });
    }

    async listProposals(
        ownerId: string,
        sessionId?: string,
        state?: PublicTeapotMcpProposalState,
    ): Promise<PublicTeapotMcpProposal[]> {
        const records = await getTeapotDataServices().repository.listMcpProposals(ownerId, sessionId);
        const refreshed = await Promise.all(records.map((record) => this.refreshExpiry(record)));
        return refreshed.filter((proposal) => state === undefined || proposal.state === state).map(toPublicProposal);
    }

    async getProposal(
        ownerId: string,
        proposalId: string,
        sessionId?: string,
        includeApprovalToken = false,
    ): Promise<TeapotMcpProposalWithApproval> {
        const found = await getTeapotDataServices().repository.getMcpProposal(proposalId);
        if (found === null || found.ownerId !== ownerId || (sessionId !== undefined && found.sessionId !== sessionId)) {
            throw new TeapotMcpAuthoringError("Proposal not found", 404);
        }
        const proposal = await this.refreshExpiry(found);
        if (!includeApprovalToken || proposal.state !== "approved") return toPublicProposal(proposal);
        const approval = await getTeapotDataServices().repository.getMcpApproval(proposal.id);
        if (approval === null || approval.usedAt !== null || Date.parse(approval.expiresAt) <= Date.now()) {
            return toPublicProposal(proposal);
        }
        return { ...toPublicProposal(proposal), approvalToken: this.createApprovalToken(approval) };
    }

    async approveProposal(ownerId: string, proposalId: string): Promise<PublicTeapotMcpProposal> {
        await getTeapotDataServices().authorization.assertCapability(ownerId, "mcp.approve");
        const proposal = await this.requireOwnerProposal(ownerId, proposalId);
        const live = await this.refreshExpiry(proposal);
        if (live.state !== "pending") {
            throw new TeapotMcpAuthoringError(`Only a pending proposal can be approved; it is ${live.state}`, 409);
        }
        if (live.mapUrl !== null && live.expectedRevision !== null) {
            const current = await teapotMapPublicationService.currentRevision(live.mapUrl);
            if (current.revision !== live.expectedRevision) {
                const stale = await this.transition(live, "stale", `Map revision advanced to ${current.revision}`);
                throw new TeapotMcpAuthoringError(`Proposal is stale at map revision ${current.revision}`, 409, stale);
            }
        }
        const payload: ApprovalTokenPayload = {
            version: 1,
            approvalId: randomUUID(),
            proposalId: live.id,
            ownerId: live.ownerId,
            sessionId: live.sessionId,
            toolName: live.toolName,
            patchDigest: live.patchDigest,
            expectedRevision: live.expectedRevision,
            expiresAt: new Date(Math.min(Date.parse(live.expiresAt), Date.now() + APPROVAL_TTL_MS)).toISOString(),
        };
        const token = this.signApprovalPayload(payload);
        const approval = await getTeapotDataServices().repository.approveMcpProposal({
            proposalId: live.id,
            ownerId,
            approvalId: payload.approvalId,
            tokenHash: hashOpaqueToken(token),
            expiresAt: payload.expiresAt,
        });
        if (approval === null) throw new TeapotMcpAuthoringError("Proposal changed before approval", 409);
        const approved = await this.requireOwnerProposal(ownerId, proposalId);
        await this.audit(ownerId, "mcp.proposal.approved", "mcp-proposal", proposalId, {
            sessionId: approved.sessionId,
            toolName: approved.toolName,
            patchDigest: approved.patchDigest,
        });
        return toPublicProposal(approved);
    }

    async denyProposal(ownerId: string, proposalId: string): Promise<PublicTeapotMcpProposal> {
        await getTeapotDataServices().authorization.assertCapability(ownerId, "mcp.approve");
        const proposal = await this.requireOwnerProposal(ownerId, proposalId);
        const denied = await this.transition(proposal, "denied", "Denied by the player", ["pending", "approved"]);
        await this.audit(ownerId, "mcp.proposal.denied", "mcp-proposal", proposalId, {});
        return toPublicProposal(denied);
    }

    async applyProposal(
        session: TeapotMcpSessionContext,
        proposalId: string,
        approvalToken: string,
    ): Promise<PublicTeapotMcpProposal> {
        const proposal = await this.requireOwnerProposal(session.ownerId, proposalId, session.sessionId);
        const live = await this.refreshExpiry(proposal);
        if (live.state !== "approved") {
            throw new TeapotMcpAuthoringError(`Proposal is not approved; it is ${live.state}`, 409);
        }
        const payload = this.verifyApprovalToken(approvalToken);
        this.assertApprovalBinding(payload, live);
        if (TeapotMcpProposalPayload.safeParse(live.payload).success === false) {
            throw new TeapotMcpAuthoringError("Proposal payload is invalid", 500);
        }
        const parsedPayload = TeapotMcpProposalPayload.parse(live.payload);
        if (parsedPayload.kind === "paid-asset-generation") {
            throw new TeapotMcpAuthoringError(
                "Paid generation is executed only in the player's browser with their configured provider",
                409,
            );
        }
        await this.consumeApproval(live, payload, approvalToken);
        try {
            let result: TeapotJsonValue;
            if (parsedPayload.kind === "map-patch") {
                const map = await teapotMapPublicationService.readMap(parsedPayload.patch.mapUrl);
                const resolvedTilesets = await resolveTeapotTilesetImports(
                    getTeapotDataServices().repository,
                    session.ownerId,
                    parsedPayload.patch,
                    TEAPOT_WOKA_PUBLIC_BASE_URL,
                );
                const compiled = compileTeapotMapPatch(map, parsedPayload.patch, resolvedTilesets);
                const publication = await teapotMapPublicationService.publish({
                    actorId: session.ownerId,
                    mapUrl: parsedPayload.patch.mapUrl,
                    expectedRevision: parsedPayload.patch.expectedRevision,
                    map: compiled.map,
                    source: "mcp",
                });
                result = toJsonValue({
                    ...publication,
                    compilation: compiled.summary,
                    importedTilesets: compiled.importedTilesets,
                });
            } else {
                const publication = await teapotMapPublicationService.restorePreviousRevision({
                    actorId: session.ownerId,
                    mapUrl: parsedPayload.mapUrl,
                    expectedRevision: parsedPayload.expectedRevision,
                    previousRevisionUrl: parsedPayload.previousRevisionUrl,
                });
                result = toJsonValue(publication);
            }
            const applied = await this.transition(live, "applied", "Applied successfully", ["approved"], result);
            await this.audit(session.ownerId, "mcp.proposal.applied", "mcp-proposal", proposalId, result);
            return toPublicProposal(applied);
        } catch (error: unknown) {
            const state = error instanceof TeapotMapRevisionConflictError ? "stale" : "failed";
            await this.transition(live, state, safeFailureMessage(error), ["approved"]);
            throw error;
        }
    }

    async claimPaidGeneration(
        ownerId: string,
        proposalId: string,
        approvalToken: string,
    ): Promise<TeapotPaidGenerationClaim> {
        await getTeapotDataServices().authorization.assertCapability(ownerId, "mcp.approve");
        const proposal = await this.requireOwnerProposal(ownerId, proposalId);
        const live = await this.refreshExpiry(proposal);
        if (live.state !== "approved") {
            throw new TeapotMcpAuthoringError(`Proposal is not approved; it is ${live.state}`, 409);
        }
        const payload = TeapotMcpProposalPayload.safeParse(proposal.payload);
        if (!payload.success || payload.data.kind !== "paid-asset-generation") {
            throw new TeapotMcpAuthoringError("This proposal is not a paid generation request", 400);
        }
        const approvalPayload = this.verifyApprovalToken(approvalToken);
        this.assertApprovalBinding(approvalPayload, live);
        await this.consumeApproval(live, approvalPayload, approvalToken);
        await this.audit(ownerId, "mcp.paid-generation.claimed", "mcp-proposal", proposalId, {
            approvalId: approvalPayload.approvalId,
        });
        return { approvalId: approvalPayload.approvalId };
    }

    async completePaidGeneration(
        ownerId: string,
        proposalId: string,
        approvalToken: string,
        uncheckedResult: unknown,
    ): Promise<PublicTeapotMcpProposal> {
        const proposal = await this.requireOwnerProposal(ownerId, proposalId);
        if (proposal.state !== "approved") {
            throw new TeapotMcpAuthoringError(`Proposal is not approved; it is ${proposal.state}`, 409);
        }
        const payload = TeapotMcpProposalPayload.safeParse(proposal.payload);
        if (!payload.success || payload.data.kind !== "paid-asset-generation") {
            throw new TeapotMcpAuthoringError("This proposal is not a paid generation request", 400);
        }
        const result = TeapotPaidGenerationCompletionResult.safeParse(uncheckedResult);
        if (!result.success) throw new TeapotMcpAuthoringError("The generation result is invalid", 400);
        const approvalPayload = this.verifyApprovalToken(approvalToken);
        this.assertApprovalBinding(approvalPayload, proposal);
        await this.assertClaimedApproval(proposal, approvalPayload, approvalToken);
        let terminalMessage: string;
        if (result.data.status === "accepted-asset") {
            await this.assertPersistedPaidAsset(ownerId, payload.data.request, result.data);
            terminalMessage = `Generated ${result.data.assetKind} asset ${result.data.assetId} was saved; applying it remains a separate approval`;
        } else {
            terminalMessage = paidGenerationFailureMessage(result.data);
        }
        const succeeded = result.data.status === "accepted-asset";
        const completed = await this.transition(
            proposal,
            succeeded ? "applied" : "failed",
            terminalMessage,
            ["approved"],
            toJsonValue(result.data),
        );
        await this.audit(
            ownerId,
            "mcp.paid-generation.completed",
            "mcp-proposal",
            proposalId,
            result.data.status === "accepted-asset"
                ? { status: result.data.status, assetId: result.data.assetId, assetKind: result.data.assetKind }
                : { status: result.data.status, reason: result.data.reason },
        );
        return toPublicProposal(completed);
    }

    private async assertPersistedPaidAsset(
        ownerId: string,
        request: z.infer<typeof TeapotPaidGenerationRequest>,
        result: AcceptedPaidAssetResult,
    ): Promise<void> {
        const expectedKind = paidAssetKindForPurpose(request.purpose);
        if (result.assetKind !== expectedKind || result.mediaType !== "image/png") {
            throw new TeapotMcpAuthoringError("The saved asset does not match the approved generation purpose", 409);
        }
        const asset = await getTeapotDataServices().repository.getAsset(result.assetId);
        if (!isMatchingPersistedAsset(asset, ownerId, expectedKind)) {
            throw new TeapotMcpAuthoringError("The generated asset is not durably stored for this owner", 409);
        }
        if (
            asset.mediaType !== result.mediaType ||
            readAssetDimension(asset, "width") !== request.output.width ||
            readAssetDimension(asset, "height") !== request.output.height
        ) {
            throw new TeapotMcpAuthoringError("The saved asset dimensions do not match the approved output", 409);
        }
        if (!isCanonicalAssetUrl(result.assetUrl, result.assetId, expectedKind)) {
            throw new TeapotMcpAuthoringError("The saved asset URL is not the canonical Teapot asset URL", 409);
        }
    }

    private async createProposal(
        session: TeapotMcpSessionContext,
        input: {
            toolName: string;
            title: string;
            summary: string;
            payload: unknown;
            patchDigest: string;
            mapUrl?: string;
            expectedRevision?: number;
            estimatedCostUsd?: number;
        },
    ): Promise<PublicTeapotMcpProposal> {
        const proposal = await getTeapotDataServices().repository.createMcpProposal({
            ownerId: session.ownerId,
            sessionId: session.sessionId,
            clientName: session.clientName,
            toolName: input.toolName,
            title: input.title,
            summary: input.summary,
            payload: toJsonValue(input.payload),
            patchDigest: input.patchDigest,
            mapUrl: input.mapUrl,
            expectedRevision: input.expectedRevision,
            estimatedCostUsd: input.estimatedCostUsd,
            expiresAt: new Date(Math.min(Date.parse(session.expiresAt), Date.now() + PROPOSAL_TTL_MS)).toISOString(),
        });
        await this.audit(session.ownerId, "mcp.proposal.created", "mcp-proposal", proposal.id, {
            sessionId: session.sessionId,
            toolName: input.toolName,
            patchDigest: input.patchDigest,
        });
        return toPublicProposal(proposal);
    }

    private async consumeApproval(
        proposal: TeapotMcpProposalRecord,
        payload: ApprovalTokenPayload,
        token: string,
    ): Promise<void> {
        const consumed = await getTeapotDataServices().repository.consumeMcpApproval({
            approvalId: payload.approvalId,
            proposalId: proposal.id,
            ownerId: proposal.ownerId,
            sessionId: proposal.sessionId,
            tokenHash: hashOpaqueToken(token),
            usedAt: new Date().toISOString(),
        });
        if (consumed === null) throw new TeapotMcpAuthoringError("Approval token was already used or expired", 409);
    }

    private async assertClaimedApproval(
        proposal: TeapotMcpProposalRecord,
        payload: ApprovalTokenPayload,
        token: string,
    ): Promise<void> {
        const approval = await getTeapotDataServices().repository.getMcpApproval(proposal.id);
        const expectedHash = approval === null ? Buffer.alloc(0) : Buffer.from(approval.tokenHash, "hex");
        const providedHash = Buffer.from(hashOpaqueToken(token), "hex");
        if (
            approval === null ||
            approval.id !== payload.approvalId ||
            approval.usedAt === null ||
            expectedHash.length !== providedHash.length ||
            !timingSafeEqual(expectedHash, providedHash)
        ) {
            throw new TeapotMcpAuthoringError("Paid generation was not claimed with this approval token", 409);
        }
    }

    private async requireOwnerProposal(
        ownerId: string,
        proposalId: string,
        sessionId?: string,
    ): Promise<TeapotMcpProposalRecord> {
        const proposal = await getTeapotDataServices().repository.getMcpProposal(proposalId);
        if (
            proposal === null ||
            proposal.ownerId !== ownerId ||
            (sessionId !== undefined && proposal.sessionId !== sessionId)
        ) {
            throw new TeapotMcpAuthoringError("Proposal not found", 404);
        }
        return proposal;
    }

    private async refreshExpiry(proposal: TeapotMcpProposalRecord): Promise<TeapotMcpProposalRecord> {
        if (
            (proposal.state === "pending" || proposal.state === "approved") &&
            Date.parse(proposal.expiresAt) <= Date.now()
        ) {
            return this.transition(proposal, "expired", "Proposal expired", [proposal.state]);
        }
        if (proposal.state === "approved") {
            const approval = await getTeapotDataServices().repository.getMcpApproval(proposal.id);
            if (approval !== null && approval.usedAt === null && Date.parse(approval.expiresAt) <= Date.now()) {
                return this.transition(proposal, "expired", "Approval expired", ["approved"]);
            }
        }
        return proposal;
    }

    private async transition(
        proposal: TeapotMcpProposalRecord,
        state: PublicTeapotMcpProposalState,
        terminalMessage: string,
        fromStates: PublicTeapotMcpProposalState[] = [proposal.state],
        result?: TeapotJsonValue,
    ): Promise<TeapotMcpProposalRecord> {
        const transitioned = await getTeapotDataServices().repository.transitionMcpProposal({
            proposalId: proposal.id,
            ownerId: proposal.ownerId,
            fromStates,
            toState: state,
            terminalMessage,
            result,
        });
        if (transitioned === null) throw new TeapotMcpAuthoringError("Proposal state changed concurrently", 409);
        return transitioned;
    }

    private assertLiveSession(session: TeapotMcpSessionRecord | null): asserts session is TeapotMcpSessionRecord {
        if (session === null || session.revokedAt !== null || Date.parse(session.expiresAt) <= Date.now()) {
            throw new TeapotMcpAuthoringError("MCP session is invalid or expired", 401);
        }
    }

    private toSessionContext(session: TeapotMcpSessionRecord): TeapotMcpSessionContext {
        return {
            sessionId: session.id,
            ownerId: session.ownerId,
            clientName: session.clientName,
            expiresAt: session.expiresAt,
        };
    }

    private createApprovalToken(approval: {
        id: string;
        proposalId: string;
        ownerId: string;
        sessionId: string;
        toolName: string;
        patchDigest: string;
        expectedRevision: number | null;
        expiresAt: string;
    }): string {
        return this.signApprovalPayload({
            version: 1,
            approvalId: approval.id,
            proposalId: approval.proposalId,
            ownerId: approval.ownerId,
            sessionId: approval.sessionId,
            toolName: approval.toolName,
            patchDigest: approval.patchDigest,
            expectedRevision: approval.expectedRevision,
            expiresAt: approval.expiresAt,
        });
    }

    private signApprovalPayload(payload: ApprovalTokenPayload): string {
        const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
        const signature = createHmac("sha256", TEAPOT_MCP_APPROVAL_SECRET).update(encoded).digest("base64url");
        return `v1.${encoded}.${signature}`;
    }

    private verifyApprovalToken(token: string): ApprovalTokenPayload {
        const [version, encoded, providedSignature, unexpected] = token.split(".");
        if (version !== "v1" || encoded === undefined || providedSignature === undefined || unexpected !== undefined) {
            throw new TeapotMcpAuthoringError("Approval token is malformed", 401);
        }
        const expectedSignature = createHmac("sha256", TEAPOT_MCP_APPROVAL_SECRET).update(encoded).digest();
        const provided = Buffer.from(providedSignature, "base64url");
        if (provided.length !== expectedSignature.length || !timingSafeEqual(provided, expectedSignature)) {
            throw new TeapotMcpAuthoringError("Approval token signature is invalid", 401);
        }
        let decoded: unknown;
        try {
            decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
        } catch {
            throw new TeapotMcpAuthoringError("Approval token payload is invalid", 401);
        }
        const payload = ApprovalTokenPayload.safeParse(decoded);
        if (!payload.success || Date.parse(payload.data.expiresAt) <= Date.now()) {
            throw new TeapotMcpAuthoringError("Approval token is invalid or expired", 401);
        }
        return payload.data;
    }

    private assertApprovalBinding(payload: ApprovalTokenPayload, proposal: TeapotMcpProposalRecord): void {
        if (
            payload.proposalId !== proposal.id ||
            payload.ownerId !== proposal.ownerId ||
            payload.sessionId !== proposal.sessionId ||
            payload.toolName !== proposal.toolName ||
            payload.patchDigest !== proposal.patchDigest ||
            payload.expectedRevision !== proposal.expectedRevision
        ) {
            throw new TeapotMcpAuthoringError("Approval token does not match this proposal", 401);
        }
    }

    private audit(
        actorId: string,
        action: string,
        objectType: string,
        objectId: string,
        details: TeapotJsonValue,
    ): Promise<unknown> {
        return getTeapotDataServices().repository.appendAuditEvent({
            actorId,
            action,
            objectType,
            objectId,
            details,
        });
    }
}

export class TeapotMcpAuthoringError extends Error {
    constructor(
        message: string,
        readonly statusCode: number,
        readonly proposal?: TeapotMcpProposalRecord,
    ) {
        super(message);
        this.name = "TeapotMcpAuthoringError";
    }
}

function toPublicProposal(record: TeapotMcpProposalRecord): PublicTeapotMcpProposal {
    const payload = TeapotMcpProposalPayload.parse(record.payload);
    return { ...record, payload };
}

function toJsonValue(value: unknown): TeapotJsonValue {
    return JSON.parse(JSON.stringify(value));
}

function safeFailureMessage(error: unknown): string {
    if (error instanceof TeapotAuthorizationError) return error.message;
    if (error instanceof Error && error.message.length <= 500) return error.message;
    return "The approved proposal could not be applied";
}

function paidGenerationFailureMessage(result: TeapotPaidGenerationCompletionResultType): string {
    if (result.status !== "generation-failed") return "Generation completed";
    switch (result.reason) {
        case "cancelled":
            return "The player cancelled the browser generation";
        case "candidate-discarded":
            return "The player discarded the generated browser candidate";
        case "provider-error":
            return "The browser provider could not complete the generation";
        default: {
            const exhaustive: never = result.reason;
            return `Generation failed: ${String(exhaustive)}`;
        }
    }
}

function paidAssetKindForPurpose(purpose: z.infer<typeof TeapotPaidGenerationRequest>["purpose"]): TeapotAssetKind {
    switch (purpose) {
        case "avatar":
            return "woka";
        case "avatar-part":
            return "woka-part";
        case "tileset":
            return "tileset";
        case "map-entity":
            return "map-entity";
        case "reference":
            return "reference";
        default: {
            const exhaustive: never = purpose;
            throw new Error(`Unsupported paid generation purpose: ${String(exhaustive)}`);
        }
    }
}

function isMatchingPersistedAsset(
    asset: TeapotAssetRecord | null,
    ownerId: string,
    expectedKind: TeapotAssetKind,
): asset is TeapotAssetRecord {
    if (asset === null || asset.ownerId !== ownerId || asset.deletedAt !== null) return false;
    if (expectedKind === "woka" || expectedKind === "woka-part") {
        if (asset.kind !== "woka") return false;
        const category = readTeapotWokaCategory(asset.metadata);
        return expectedKind === "woka" ? category === "woka" : category !== "woka";
    }
    if (expectedKind === "reference") return asset.kind === "reference" && !asset.published;
    return asset.kind === expectedKind && asset.published;
}

function readAssetDimension(asset: TeapotAssetRecord, key: "width" | "height"): number | null {
    if (typeof asset.metadata !== "object" || asset.metadata === null || Array.isArray(asset.metadata)) return null;
    const value = asset.metadata[key];
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function isCanonicalAssetUrl(url: string, assetId: string, kind: TeapotAssetKind): boolean {
    const route =
        kind === "woka" || kind === "woka-part"
            ? `/teapot/woka-assets/${assetId}.png`
            : kind === "tileset"
              ? `/teapot/tileset-assets/${assetId}.png`
              : kind === "reference"
                ? `/teapot/generated-assets/private/${assetId}.png`
                : `/teapot/generated-assets/${assetId}.png`;
    let candidate: URL;
    try {
        candidate = new URL(url);
    } catch {
        return false;
    }
    if ((candidate.protocol !== "http:" && candidate.protocol !== "https:") || candidate.search || candidate.hash) {
        return false;
    }
    const configuredBase = TEAPOT_WOKA_PUBLIC_BASE_URL.replace(/\/+$/, "");
    if (/^https?:\/\//.test(configuredBase)) {
        try {
            return candidate.href === new URL(`${configuredBase}${route}`).href;
        } catch {
            return false;
        }
    }
    return candidate.pathname === `${configuredBase}${route}`;
}

export const teapotMcpAuthoringService = new TeapotMcpAuthoringService();
