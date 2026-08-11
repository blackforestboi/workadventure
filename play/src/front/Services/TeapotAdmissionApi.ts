import { z } from "zod";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

const ADMISSION_INVITE_SESSION_KEY = "teapotAdmissionInvite";

const AdmissionStatus = z.object({
    identity: z.object({
        id: z.string(),
        displayName: z.string().nullable(),
        admissionState: z.enum(["pending", "admitted", "suspended"]),
    }),
    acceptedEndorsements: z.number(),
    requiredEndorsements: z.number(),
    remainingEndorsements: z.number(),
});

const PendingEndorsement = z.object({
    confirmationToken: z.string(),
    expiresAt: z.string(),
    candidate: z.object({
        id: z.string(),
        displayName: z.string().nullable(),
        admissionState: z.enum(["pending", "admitted", "suspended"]),
    }),
});

export type AdmissionStatus = z.infer<typeof AdmissionStatus>;
export type PendingEndorsement = z.infer<typeof PendingEndorsement>;

export class TeapotAdmissionApi {
    async isXAuthEnabled(): Promise<boolean> {
        const response = await fetch(new URL("teapot/auth/x/config", ABSOLUTE_PUSHER_URL));
        if (!response.ok) return false;
        return z.object({ enabled: z.boolean() }).parse(await response.json()).enabled;
    }

    getApplicationToken(): string | null {
        return new URL(window.location.href).searchParams.get("token") ?? localUserStore.getAuthToken();
    }

    createLoginUrl(): string {
        this.getInviteToken();
        const returnTo = new URL(window.location.href);
        returnTo.searchParams.delete("token");
        returnTo.searchParams.delete("teapotInvite");
        const fragment = new URLSearchParams(returnTo.hash.slice(1));
        fragment.delete("teapotInvite");
        returnTo.hash = fragment.toString();
        const login = new URL("teapot/auth/x/start", ABSOLUTE_PUSHER_URL);
        login.searchParams.set("returnTo", returnTo.toString());
        return login.toString();
    }

    getInviteToken(): string | null {
        const url = new URL(window.location.href);
        const fragment = new URLSearchParams(url.hash.slice(1));
        const token =
            fragment.get("teapotInvite") ??
            url.searchParams.get("teapotInvite") ??
            window.sessionStorage.getItem(ADMISSION_INVITE_SESSION_KEY);
        if (token !== null) window.sessionStorage.setItem(ADMISSION_INVITE_SESSION_KEY, token);
        return token;
    }

    clearInviteToken(): void {
        window.sessionStorage.removeItem(ADMISSION_INVITE_SESSION_KEY);
        const url = new URL(window.location.href);
        url.searchParams.delete("teapotInvite");
        const fragment = new URLSearchParams(url.hash.slice(1));
        fragment.delete("teapotInvite");
        url.hash = fragment.toString();
        window.history.replaceState({}, "", url);
    }

    async getStatus(token: string): Promise<AdmissionStatus> {
        return AdmissionStatus.parse(await this.request("teapot/admission/status", token));
    }

    async createShareLink(token: string): Promise<{ shareUrl: string; expiresAt: string }> {
        return z
            .object({ shareUrl: z.string().url(), expiresAt: z.string() })
            .parse(await this.request("teapot/admission/share", token, {}));
    }

    async createPendingEndorsement(token: string, shareToken: string): Promise<PendingEndorsement> {
        return PendingEndorsement.parse(await this.request("teapot/admission/pending", token, { shareToken }));
    }

    async confirmEndorsement(token: string, confirmationToken: string): Promise<void> {
        await this.request("teapot/admission/confirm", token, { confirmationToken });
    }

    private async request(path: string, token: string, body?: object): Promise<unknown> {
        const response = await fetch(new URL(path, ABSOLUTE_PUSHER_URL), {
            method: body === undefined ? "GET" : "POST",
            headers: {
                Authorization: token,
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) {
            const payload = (await response.json().catch(() => undefined)) as
                { error?: unknown; message?: unknown } | undefined;
            throw new Error(
                typeof payload?.error === "string"
                    ? payload.error
                    : typeof payload?.message === "string"
                      ? payload.message
                      : `Request failed (${response.status})`,
            );
        }
        return response.json();
    }
}

export const teapotAdmissionApi = new TeapotAdmissionApi();
