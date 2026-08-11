import { z } from "zod";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

const RoomEditorAccessModeSchema = z.enum(["everyone", "specific", "nobody"]);

const RoomEditorAccessEditorSchema = z.object({
    userId: z.string(),
    identifier: z.string(),
    displayName: z.string(),
});

const RoomEditorAccessResponseSchema = z.object({
    configured: z.boolean(),
    mapId: z.string(),
    mode: RoomEditorAccessModeSchema,
    version: z.number().int().nonnegative(),
    editors: z.array(RoomEditorAccessEditorSchema),
});

export type RoomEditorAccessMode = z.infer<typeof RoomEditorAccessModeSchema>;
export type RoomEditorAccessResponse = z.infer<typeof RoomEditorAccessResponseSchema>;

export interface RoomEditorAccessEditorInput {
    identifier: string;
    displayName?: string;
}

export interface UpdateRoomEditorAccessRequest {
    roomId: string;
    mode: RoomEditorAccessMode;
    expectedVersion: number;
    editors: RoomEditorAccessEditorInput[];
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetcher = (input, init) => globalThis.fetch(input, init);

export class RoomEditorAccessApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "RoomEditorAccessApiError";
    }
}

export class RoomEditorAccessConflictError extends RoomEditorAccessApiError {
    constructor(message: string) {
        super(message, 409);
        this.name = "RoomEditorAccessConflictError";
    }
}

export class RoomEditorAccessApi {
    constructor(
        private readonly baseUrl = ABSOLUTE_PUSHER_URL,
        private readonly tokenProvider: () => string | null = () => localUserStore.getAuthToken(),
        private readonly fetcher: Fetcher = browserFetch,
    ) {}

    async get(roomId: string, signal?: AbortSignal): Promise<RoomEditorAccessResponse> {
        const url = new URL("teapot/rooms/editor-access", this.baseUrl);
        url.searchParams.set("roomId", roomId);
        return RoomEditorAccessResponseSchema.parse(await this.request(url, { method: "GET", signal }));
    }

    async update(request: UpdateRoomEditorAccessRequest, signal?: AbortSignal): Promise<RoomEditorAccessResponse> {
        return RoomEditorAccessResponseSchema.parse(
            await this.request("teapot/rooms/editor-access", {
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
            throw new RoomEditorAccessApiError("Sign in before managing room editor access.", 401);
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
                typeof payload?.error === "string"
                    ? payload.error
                    : typeof payload?.message === "string"
                      ? payload.message
                      : `Request failed (${response.status})`;
            if (response.status === 409) {
                throw new RoomEditorAccessConflictError(message);
            }
            throw new RoomEditorAccessApiError(message, response.status);
        }

        return payload;
    }
}

export const roomEditorAccessApi = new RoomEditorAccessApi();
