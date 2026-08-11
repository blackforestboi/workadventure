import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import { TeapotAdmissionConflictError, TeapotAdmissionTokenError } from "./TeapotDataErrors";
import type { TeapotDataServices } from "./createTeapotDataServices";
import { generateOpaqueToken, hashOpaqueToken } from "./TeapotTokenSecurity";

export const TEAPOT_REQUIRED_ENDORSEMENTS = 3;

export interface TeapotAdmissionServiceOptions {
    frontUrl: string;
    now?: () => Date;
    admissionLinkTtlMs?: number;
    endorsementIntentTtlMs?: number;
    requiredEndorsements?: number;
    createToken?: () => string;
}

export interface TeapotAdmissionStatus {
    identity: TeapotIdentity;
    acceptedEndorsements: number;
    requiredEndorsements: number;
    remainingEndorsements: number;
}

export interface TeapotPendingEndorsement {
    confirmationToken: string;
    expiresAt: string;
    candidate: Pick<TeapotIdentity, "id" | "displayName" | "admissionState">;
}

export class TeapotAdmissionService {
    private readonly now: () => Date;
    private readonly admissionLinkTtlMs: number;
    private readonly endorsementIntentTtlMs: number;
    private readonly requiredEndorsements: number;
    private readonly createToken: () => string;

    constructor(
        private readonly services: TeapotDataServices,
        private readonly options: TeapotAdmissionServiceOptions,
    ) {
        this.now = options.now ?? (() => new Date());
        this.admissionLinkTtlMs = options.admissionLinkTtlMs ?? 7 * 24 * 60 * 60 * 1_000;
        this.endorsementIntentTtlMs = options.endorsementIntentTtlMs ?? 10 * 60 * 1_000;
        this.requiredEndorsements = options.requiredEndorsements ?? TEAPOT_REQUIRED_ENDORSEMENTS;
        this.createToken = options.createToken ?? generateOpaqueToken;
        if (!Number.isInteger(this.requiredEndorsements) || this.requiredEndorsements < 1) {
            throw new Error("Teapot admission requires at least one endorsement");
        }
    }

    async getStatus(userId: string): Promise<TeapotAdmissionStatus> {
        const identity = await this.requireIdentity(userId);
        const acceptedEndorsements = (await this.services.repository.listEndorsements(userId)).filter(
            (endorsement) => endorsement.state === "accepted",
        ).length;
        return {
            identity,
            acceptedEndorsements,
            requiredEndorsements: this.requiredEndorsements,
            remainingEndorsements: Math.max(0, this.requiredEndorsements - acceptedEndorsements),
        };
    }

    async createShareLink(candidateId: string): Promise<{ shareUrl: string; expiresAt: string }> {
        const candidate = await this.requireIdentity(candidateId);
        if (candidate.admissionState !== "pending") {
            throw new TeapotAdmissionConflictError("Only pending candidates can create an admission link");
        }
        const createdAt = this.now();
        const expiresAt = new Date(createdAt.getTime() + this.admissionLinkTtlMs).toISOString();
        const token = this.createToken();
        const link = await this.services.repository.createAdmissionLink({
            candidateId,
            tokenHash: hashOpaqueToken(token),
            expiresAt,
        });
        const shareUrl = this.createShareUrl(token);
        await this.services.repository.appendAuditEvent({
            actorId: candidateId,
            action: "admission.link-created",
            objectType: "admission-link",
            objectId: link.id,
            details: { expiresAt },
        });
        return { shareUrl, expiresAt };
    }

    async createPendingEndorsement(endorserId: string, shareToken: string): Promise<TeapotPendingEndorsement> {
        await this.assertAdmittedEndorser(endorserId);
        const now = this.now();
        const link = await this.services.repository.findAdmissionLinkByTokenHash(hashOpaqueToken(shareToken));
        if (link === null || link.revokedAt !== null || Date.parse(link.expiresAt) <= now.getTime()) {
            throw new TeapotAdmissionTokenError("Admission link is invalid or expired");
        }
        const candidate = await this.requireIdentity(link.candidateId);
        if (candidate.admissionState !== "pending") {
            throw new TeapotAdmissionConflictError("The candidate is not pending admission");
        }
        if (candidate.id === endorserId) throw new TeapotAdmissionConflictError("You cannot endorse yourself");
        const previous = (await this.services.repository.listEndorsements(candidate.id)).find(
            (endorsement) => endorsement.endorserId === endorserId,
        );
        if (previous !== undefined) {
            throw new TeapotAdmissionConflictError("You already endorsed this candidate");
        }

        const confirmationToken = this.createToken();
        const expiresAt = new Date(now.getTime() + this.endorsementIntentTtlMs).toISOString();
        await this.services.repository.createEndorsementIntent({
            admissionLinkId: link.id,
            candidateId: candidate.id,
            endorserId,
            tokenHash: hashOpaqueToken(confirmationToken),
            expiresAt,
        });
        return {
            confirmationToken,
            expiresAt,
            candidate: {
                id: candidate.id,
                displayName: candidate.displayName,
                admissionState: candidate.admissionState,
            },
        };
    }

    async confirmEndorsement(endorserId: string, confirmationToken: string) {
        await this.assertAdmittedEndorser(endorserId);
        const result = await this.services.repository.confirmAdmissionEndorsement({
            tokenHash: hashOpaqueToken(confirmationToken),
            endorserId,
            confirmedAt: this.now().toISOString(),
            requiredEndorsements: this.requiredEndorsements,
        });
        await this.services.repository.appendAuditEvent({
            actorId: endorserId,
            action: "admission.endorsed",
            objectType: "identity",
            objectId: result.candidate.id,
            details: { acceptedEndorsements: result.acceptedEndorsements },
        });
        if (result.admittedNow) {
            await this.services.repository.appendAuditEvent({
                action: "admission.admitted",
                objectType: "identity",
                objectId: result.candidate.id,
                details: { acceptedEndorsements: result.acceptedEndorsements },
            });
        }
        return result;
    }

    private async assertAdmittedEndorser(userId: string): Promise<void> {
        const identity = await this.requireIdentity(userId);
        if (identity.admissionState !== "admitted") {
            throw new TeapotAdmissionConflictError("Only admitted users can endorse candidates");
        }
        await this.services.authorization.assertCapability(userId, "endorsement.create");
    }

    private async requireIdentity(userId: string): Promise<TeapotIdentity> {
        const identity = await this.services.repository.getIdentity(userId);
        if (identity === null) throw new TeapotAdmissionTokenError("Teapot identity does not exist");
        return identity;
    }

    private createShareUrl(token: string): string {
        if (!this.options.frontUrl) throw new Error("FRONT_URL is required to create Teapot admission links");
        const url = new URL(this.options.frontUrl);
        const fragment = new URLSearchParams(url.hash.slice(1));
        fragment.set("teapotInvite", token);
        url.hash = fragment.toString();
        return url.toString();
    }
}
