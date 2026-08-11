import { z } from "zod";

import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

const WorldCreationResultSchema = z.object({
    roomUrl: z.string().url(),
    wamUrl: z.string().url(),
    mapUrl: z.string().url(),
});

export type WorldCreationResult = z.infer<typeof WorldCreationResultSchema>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetcher = (input, init) => globalThis.fetch(input, init);

export class WorldCreationApi {
    public constructor(
        private readonly baseUrl = ABSOLUTE_PUSHER_URL,
        private readonly tokenProvider: () => string | null = () => localUserStore.getAuthToken(),
        private readonly fetcher: Fetcher = browserFetch,
    ) {}

    public async create(sourceRoomUrl: string, signal?: AbortSignal): Promise<WorldCreationResult> {
        const token = this.tokenProvider();
        if (!token) throw new Error("Sign in before creating a world.");

        const response = await this.fetcher(new URL("teapot/worlds", this.baseUrl), {
            method: "POST",
            headers: {
                Authorization: token,
                "Content-Type": "application/json",
            },
            credentials: "include",
            cache: "no-store",
            body: JSON.stringify({ sourceRoomUrl }),
            signal,
        });
        const payload: unknown = await response.json().catch(() => undefined);
        if (!response.ok) {
            const message =
                typeof payload === "object" &&
                payload !== null &&
                "error" in payload &&
                typeof payload.error === "string"
                    ? payload.error
                    : `World creation failed (${response.status})`;
            throw new Error(message);
        }
        return WorldCreationResultSchema.parse(payload);
    }
}

export const worldCreationApi = new WorldCreationApi();
