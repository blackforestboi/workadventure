// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
    TeapotAdmissionConflictError,
    TeapotAdmissionTokenError,
    TeapotDataConflictError,
} from "../../src/pusher/teapot/TeapotDataErrors";
import { TeapotAdmissionService } from "../../src/pusher/teapot/TeapotAdmissionService";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { TeapotWorldAdmissionGate } from "../../src/pusher/teapot/TeapotWorldAdmissionGate";

function createFixture() {
    let nextId = 0;
    let now = Date.parse("2026-08-09T10:00:00.000Z");
    let nextToken = 0;
    const repository = new InMemoryTeapotDataRepository({
        createId: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
        now: () => new Date(now),
    });
    const services = createTeapotDataServices(repository);
    const admission = new TeapotAdmissionService(services, {
        frontUrl: "https://play.example.test/",
        now: () => new Date(now),
        admissionLinkTtlMs: 60_000,
        endorsementIntentTtlMs: 10_000,
        createToken: () => `opaque-token-${String(++nextToken).padStart(32, "0")}`,
    });
    return {
        repository,
        services,
        admission,
        advanceTime(milliseconds: number) {
            now += milliseconds;
        },
    };
}

async function createAdmittedEndorser(fixture: ReturnType<typeof createFixture>, subject: string) {
    const identity = await fixture.services.localIdentity.resolve({ localSubject: subject, initialRoles: ["creator"] });
    return fixture.repository.updateAdmissionState(identity.id, "admitted");
}

function shareToken(shareUrl: string): string {
    const token = new URLSearchParams(new URL(shareUrl).hash.slice(1)).get("teapotInvite");
    if (token === null) throw new Error("Fixture share URL has no token");
    return token;
}

describe("TeapotAdmissionService", () => {
    it("admits a candidate only after three distinct admitted users confirm", async () => {
        const fixture = createFixture();
        const candidate = await fixture.services.localIdentity.resolve({ localSubject: "candidate" });
        const endorsers = await Promise.all(
            ["one", "two", "three"].map((subject) => createAdmittedEndorser(fixture, subject)),
        );
        const link = await fixture.admission.createShareLink(candidate.id);

        for (const [index, endorser] of endorsers.entries()) {
            // eslint-disable-next-line no-await-in-loop -- each endorsement advances the admission state for the next assertion
            const pending = await fixture.admission.createPendingEndorsement(endorser.id, shareToken(link.shareUrl));
            // eslint-disable-next-line no-await-in-loop -- each endorsement advances the admission state for the next assertion
            const confirmation = await fixture.admission.confirmEndorsement(endorser.id, pending.confirmationToken);
            expect(confirmation.acceptedEndorsements).toBe(index + 1);
            expect(confirmation.candidate.admissionState).toBe(index === 2 ? "admitted" : "pending");
        }

        const status = await fixture.admission.getStatus(candidate.id);
        expect(status).toMatchObject({ acceptedEndorsements: 3, remainingEndorsements: 0 });
        expect(await fixture.repository.listRoles(candidate.id)).toContain("creator");
    });

    it("rejects duplicate endorsements and one-time confirmation replay", async () => {
        const fixture = createFixture();
        const candidate = await fixture.services.localIdentity.resolve({ localSubject: "candidate" });
        const endorser = await createAdmittedEndorser(fixture, "endorser");
        const link = await fixture.admission.createShareLink(candidate.id);
        const pending = await fixture.admission.createPendingEndorsement(endorser.id, shareToken(link.shareUrl));
        await fixture.admission.confirmEndorsement(endorser.id, pending.confirmationToken);

        await expect(
            fixture.admission.confirmEndorsement(endorser.id, pending.confirmationToken),
        ).rejects.toBeInstanceOf(TeapotDataConflictError);
        await expect(
            fixture.admission.createPendingEndorsement(endorser.id, shareToken(link.shareUrl)),
        ).rejects.toBeInstanceOf(TeapotAdmissionConflictError);
    });

    it("rejects expired and revoked share links", async () => {
        const fixture = createFixture();
        const candidate = await fixture.services.localIdentity.resolve({ localSubject: "candidate" });
        const endorser = await createAdmittedEndorser(fixture, "endorser");
        const first = await fixture.admission.createShareLink(candidate.id);
        await fixture.admission.createShareLink(candidate.id);

        await expect(
            fixture.admission.createPendingEndorsement(endorser.id, shareToken(first.shareUrl)),
        ).rejects.toBeInstanceOf(TeapotAdmissionTokenError);

        const expiring = await fixture.admission.createShareLink(candidate.id);
        fixture.advanceTime(60_001);
        await expect(
            fixture.admission.createPendingEndorsement(endorser.id, shareToken(expiring.shareUrl)),
        ).rejects.toBeInstanceOf(TeapotAdmissionTokenError);
    });

    it("allows a fresh confirmation after the candidate replaces their share link", async () => {
        const fixture = createFixture();
        const candidate = await fixture.services.localIdentity.resolve({ localSubject: "candidate" });
        const endorser = await createAdmittedEndorser(fixture, "endorser");
        const firstLink = await fixture.admission.createShareLink(candidate.id);
        const firstPending = await fixture.admission.createPendingEndorsement(
            endorser.id,
            shareToken(firstLink.shareUrl),
        );
        const replacementLink = await fixture.admission.createShareLink(candidate.id);

        await expect(
            fixture.admission.confirmEndorsement(endorser.id, firstPending.confirmationToken),
        ).rejects.toBeInstanceOf(TeapotDataConflictError);
        await expect(
            fixture.admission.createPendingEndorsement(endorser.id, shareToken(replacementLink.shareUrl)),
        ).resolves.toHaveProperty("confirmationToken");
    });

    it("enforces self-endorsement at the repository boundary", async () => {
        const fixture = createFixture();
        const candidate = await fixture.services.localIdentity.resolve({ localSubject: "candidate" });
        await expect(
            fixture.repository.createEndorsement({ candidateId: candidate.id, endorserId: candidate.id }),
        ).rejects.toBeInstanceOf(TeapotDataConflictError);
    });

    it("temporarily lets X-authenticated users enter without invitation checks", async () => {
        const fixture = createFixture();
        const pending = await fixture.services.localIdentity.resolve({ localSubject: "pending" });
        const gate = new TeapotWorldAdmissionGate(fixture.services);

        await expect(gate.assertTokenCanEnter({ identifier: pending.id, authProvider: "x" })).resolves.toBeUndefined();
    });
});
