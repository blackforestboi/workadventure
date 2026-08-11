// @vitest-environment node
/* eslint-disable @typescript-eslint/require-await -- synchronous database test double implements the asynchronous pool contract */

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
    PostgresPool,
    PostgresQueryResult,
    PostgresTransactionClient,
} from "../../src/pusher/teapot/PostgresClient";
import { PostgresMigrationRunner } from "../../src/pusher/teapot/PostgresMigrationRunner";

class RecordingPostgresClient implements PostgresTransactionClient {
    readonly queries: string[] = [];

    async query<Row extends object = Record<string, unknown>>(
        query: string,
        _values?: readonly unknown[],
    ): Promise<PostgresQueryResult<Row>> {
        this.queries.push(query);
        return { rows: [], rowCount: 0 };
    }

    release(): void {}
}

class RecordingPostgresPool implements PostgresPool {
    readonly queries: string[] = [];
    readonly client = new RecordingPostgresClient();

    async query<Row extends object = Record<string, unknown>>(
        query: string,
        _values?: readonly unknown[],
    ): Promise<PostgresQueryResult<Row>> {
        this.queries.push(query);
        return { rows: [], rowCount: 0 };
    }

    async connect(): Promise<PostgresTransactionClient> {
        return this.client;
    }
}

describe("PostgresMigrationRunner", () => {
    it("creates the migration ledger and applies the foundation schema to an empty database", async () => {
        const pool = new RecordingPostgresPool();
        const migrationsDirectory = fileURLToPath(new URL("../../src/pusher/teapot/migrations", import.meta.url));
        const runner = new PostgresMigrationRunner(pool, migrationsDirectory);

        await runner.migrate();

        expect(pool.queries.join("\n")).toContain("teapot_schema_migrations");
        expect(pool.client.queries).toContain("BEGIN");
        expect(pool.client.queries.join("\n")).toContain("CREATE TABLE teapot_users");
        expect(pool.client.queries.join("\n")).toContain("CREATE TABLE teapot_map_writer_leases");
        expect(pool.client.queries.join("\n")).toContain("CREATE TABLE teapot_active_woka_selections");
        expect(pool.client.queries.join("\n")).toContain("CREATE TABLE teapot_oauth_states");
        expect(pool.client.queries.join("\n")).toContain("CREATE TABLE teapot_admission_links");
        expect(pool.client.queries.join("\n")).toContain("CREATE TABLE teapot_endorsement_intents");
        expect(pool.client.queries.join("\n")).toContain("INSERT INTO teapot_schema_migrations");
        expect(pool.client.queries).toContain("COMMIT");
    });
});
