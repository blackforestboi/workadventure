import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => ({
    TEAPOT_DATABASE_URL: "",
    TEAPOT_MIGRATIONS_DIRECTORY: "",
    TEAPOT_REQUIRE_PERSISTENCE: false,
}));

import { registerPostgresPoolErrorHandler } from "../../src/pusher/teapot/TeapotDataRuntime";

describe("registerPostgresPoolErrorHandler", () => {
    it("handles a failed idle connection instead of leaving an unhandled pool error", () => {
        let errorListener: ((error: Error) => void) | undefined;
        const pool = {
            on: vi.fn((_event: string, listener: (error: Error) => void) => {
                errorListener = listener;
                return pool;
            }),
        } as unknown as Pick<Pool, "on">;
        const error = new Error("Connection terminated unexpectedly");
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

        registerPostgresPoolErrorHandler(pool);
        errorListener?.(error);

        expect(pool.on).toHaveBeenCalledWith("error", expect.any(Function));
        expect(consoleError).toHaveBeenCalledWith("Teapot PostgreSQL pool discarded a failed connection", error);
    });
});
