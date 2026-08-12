import { z } from "zod";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

const RoomAccessModeSchema = z.enum(["everyone", "specific", "nobody"]);
const RoomAccessRoleSchema = z.enum(["view", "edit", "admin", "directory"]);
const RoomAccessUserSchema = z.object({
    userId: z.string(),
    identifier: z.string(),
    displayName: z.string(),
});
const RoomAccessPolicySchema = z.object({
    role: RoomAccessRoleSchema,
    configured: z.boolean(),
    mode: RoomAccessModeSchema,
    version: z.number().int().nonnegative(),
    members: z.array(RoomAccessUserSchema),
});
const RoomVisitorSchema = RoomAccessUserSchema.extend({
    firstVisitedAt: z.string(),
    lastVisitedAt: z.string(),
    visitCount: z.number().int().positive(),
    roles: z.array(RoomAccessRoleSchema),
});
const RoomAccessResponseSchema = z.object({
    mapId: z.string(),
    policies: z.array(RoomAccessPolicySchema).length(4),
    visitors: z.array(RoomVisitorSchema),
});

export type RoomAccessMode = z.infer<typeof RoomAccessModeSchema>;
export type RoomAccessRole = z.infer<typeof RoomAccessRoleSchema>;
export type RoomAccessUser = z.infer<typeof RoomAccessUserSchema>;
export type RoomAccessPolicy = z.infer<typeof RoomAccessPolicySchema>;
export type RoomVisitor = z.infer<typeof RoomVisitorSchema>;
export type RoomAccessResponse = z.infer<typeof RoomAccessResponseSchema>;

export interface RoomAccessMemberInput {
    identifier: string;
    displayName?: string;
}

export interface UpdateRoomAccessRequest {
    roomId: string;
    role: RoomAccessRole;
    mode: RoomAccessMode;
    expectedVersion: number;
    members: RoomAccessMemberInput[];
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetcher = (input, init) => globalThis.fetch(input, init);

export class RoomAccessApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "RoomAccessApiError";
    }
}

export class RoomAccessConflictError extends RoomAccessApiError {
    constructor(message: string) {
        super(message, 409);
        this.name = "RoomAccessConflictError";
    }
}

export class RoomAccessApi {
    constructor(
        private readonly baseUrl = ABSOLUTE_PUSHER_URL,
        private readonly tokenProvider: () => string | null = () => localUserStore.getAuthToken(),
        private readonly fetcher: Fetcher = browserFetch,
    ) {}

    async get(roomId: string, signal?: AbortSignal): Promise<RoomAccessResponse> {
        const url = new URL("teapot/rooms/access", this.baseUrl);
        url.searchParams.set("roomId", roomId);
        return RoomAccessResponseSchema.parse(await this.request(url, { method: "GET", signal }));
    }

    async update(request: UpdateRoomAccessRequest, signal?: AbortSignal): Promise<RoomAccessPolicy> {
        return RoomAccessPolicySchema.parse(
            await this.request("teapot/rooms/access", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
                signal,
            }),
        );
    }

    private async request(path: string | URL, init: RequestInit): Promise<unknown> {
        const token = this.tokenProvider();
        if (token === null || token.length === 0) {
            throw new RoomAccessApiError("Sign in before managing room access.", 401);
        }
        const headers = new Headers(init.headers);
        headers.set("Authorization", token);
        const response = await this.fetcher(path instanceof URL ? path : new URL(path, this.baseUrl), {
            ...init,
            headers,
            credentials: "include",
            cache: "no-store",
        });
        const payload = (await response.json().catch(() => undefined)) as
            | { error?: unknown; message?: unknown }
            | undefined;
        if (!response.ok) {
            const message =
                typeof payload?.message === "string"
                    ? payload.message
                    : typeof payload?.error === "string"
                      ? payload.error
                      : `Room access request failed (${response.status})`;
            if (response.status === 409) throw new RoomAccessConflictError(message);
            throw new RoomAccessApiError(message, response.status);
        }
        return payload;
    }
}

export const roomAccessApi = new RoomAccessApi();
