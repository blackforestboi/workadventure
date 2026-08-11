// @vitest-environment node

import { describe, expect, it } from "vitest";

import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";

describe("Teapot MCP repository lifecycle", () => {
    it("binds one approval to the exact owner, session, proposal, and token hash", async () => {
        const ids = [
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
            "00000000-0000-4000-8000-000000000003",
        ];
        const repository = new InMemoryTeapotDataRepository({
            createId: () => ids.shift() ?? "00000000-0000-4000-8000-000000000099",
            now: () => new Date("2026-08-09T10:00:00.000Z"),
        });
        const owner = await repository.resolveIdentity({ provider: "x", providerSubject: "42" });
        const session = await repository.createMcpSession({
            ownerId: owner.id,
            clientName: "Codex",
            tokenHash: "a".repeat(64),
            expiresAt: "2026-08-09T12:00:00.000Z",
        });
        const proposal = await repository.createMcpProposal({
            ownerId: owner.id,
            sessionId: session.id,
            clientName: session.clientName,
            toolName: "teapot_propose_map_patch",
            title: "Paint a path",
            summary: "Four tiles",
            payload: { kind: "map-patch" },
            patchDigest: "b".repeat(64),
            mapUrl: "https://maps.example.test/world.tmj",
            expectedRevision: 3,
            expiresAt: "2026-08-09T10:30:00.000Z",
        });
        const approval = await repository.approveMcpProposal({
            proposalId: proposal.id,
            ownerId: owner.id,
            approvalId: "00000000-0000-4000-8000-000000000010",
            tokenHash: "c".repeat(64),
            expiresAt: "2026-08-09T10:10:00.000Z",
        });

        expect(approval).toMatchObject({
            proposalId: proposal.id,
            ownerId: owner.id,
            sessionId: session.id,
            patchDigest: "b".repeat(64),
            expectedRevision: 3,
        });
        expect(
            await repository.consumeMcpApproval({
                approvalId: approval?.id ?? "",
                proposalId: proposal.id,
                ownerId: owner.id,
                sessionId: session.id,
                tokenHash: "wrong".repeat(13).slice(0, 64),
                usedAt: "2026-08-09T10:01:00.000Z",
            }),
        ).toBeNull();
        expect(
            await repository.consumeMcpApproval({
                approvalId: approval?.id ?? "",
                proposalId: proposal.id,
                ownerId: owner.id,
                sessionId: session.id,
                tokenHash: "c".repeat(64),
                usedAt: "2026-08-09T10:01:00.000Z",
            }),
        ).toMatchObject({ usedAt: "2026-08-09T10:01:00.000Z" });
        expect(
            await repository.consumeMcpApproval({
                approvalId: approval?.id ?? "",
                proposalId: proposal.id,
                ownerId: owner.id,
                sessionId: session.id,
                tokenHash: "c".repeat(64),
                usedAt: "2026-08-09T10:02:00.000Z",
            }),
        ).toBeNull();
    });
});
