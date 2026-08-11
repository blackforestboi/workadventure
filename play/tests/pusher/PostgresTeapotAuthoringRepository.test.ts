// @vitest-environment node

import { describe, expect, it } from "vitest";

import type {
    PostgresPool,
    PostgresQueryResult,
    PostgresTransactionClient,
} from "../../src/pusher/teapot/PostgresClient";
import { PostgresTeapotDataRepository } from "../../src/pusher/teapot/PostgresTeapotDataRepository";

class ProviderLinkPostgresPool implements PostgresPool {
    queryText = "";
    queryValues: readonly unknown[] | undefined;

    query<Row extends object = Record<string, unknown>>(
        queryText: string,
        queryValues?: readonly unknown[],
    ): Promise<PostgresQueryResult<Row>> {
        this.queryText = queryText;
        this.queryValues = queryValues;
        return Promise.resolve({ rows: [{ has_link: true } as unknown as Row], rowCount: 1 });
    }

    connect(): Promise<PostgresTransactionClient> {
        return Promise.reject(new Error("Unexpected transaction"));
    }
}

describe("PostgresTeapotDataRepository authoring identities", () => {
    it("checks provider ownership by stable internal user ID", async () => {
        const pool = new ProviderLinkPostgresPool();
        const repository = new PostgresTeapotDataRepository(pool);

        await expect(repository.hasProviderLink("user-1", "x")).resolves.toBe(true);
        expect(pool.queryText).toContain("FROM teapot_provider_links");
        expect(pool.queryValues).toEqual(["user-1", "x"]);
    });
});
