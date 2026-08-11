// @vitest-environment node
/* eslint-disable @typescript-eslint/require-await -- synchronous database test double implements the asynchronous pool contract */

import { describe, expect, it } from "vitest";

import type {
    PostgresPool,
    PostgresQueryResult,
    PostgresTransactionClient,
} from "../../src/pusher/teapot/PostgresClient";
import { PostgresTeapotDataRepository } from "../../src/pusher/teapot/PostgresTeapotDataRepository";

interface RecordedQuery {
    statement: string;
    values: readonly unknown[] | undefined;
}

class EndorsementIntentPostgresClient implements PostgresTransactionClient {
    readonly queries: RecordedQuery[] = [];

    async query<Row extends object = Record<string, unknown>>(
        statement: string,
        values?: readonly unknown[],
    ): Promise<PostgresQueryResult<Row>> {
        this.queries.push({ statement, values });
        if (statement.includes("INSERT INTO teapot_endorsement_intents")) {
            const row = {
                id: "intent-1",
                admission_link_id: "link-1",
                candidate_id: "candidate-1",
                endorser_id: "endorser-1",
                token_hash: "token-hash",
                expires_at: "2026-08-09T12:05:00.000Z",
                consumed_at: null,
                revoked_at: null,
                created_at: "2026-08-09T12:00:00.000Z",
            } as unknown as Row;
            return { rows: [row], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
    }

    release(): void {}
}

class EndorsementIntentPostgresPool implements PostgresPool {
    readonly client = new EndorsementIntentPostgresClient();

    async query<Row extends object = Record<string, unknown>>(): Promise<PostgresQueryResult<Row>> {
        throw new Error("Unexpected non-transactional query");
    }

    async connect(): Promise<PostgresTransactionClient> {
        return this.client;
    }
}

describe("PostgresTeapotDataRepository admission intents", () => {
    it("scopes expiry cleanup to the link and duplicate detection to the candidate", async () => {
        const pool = new EndorsementIntentPostgresPool();
        const repository = new PostgresTeapotDataRepository(pool, {
            createId: () => "intent-1",
            now: () => new Date("2026-08-09T12:00:00.000Z"),
        });

        const intent = await repository.createEndorsementIntent({
            admissionLinkId: "link-1",
            candidateId: "candidate-1",
            endorserId: "endorser-1",
            tokenHash: "token-hash",
            expiresAt: "2026-08-09T12:05:00.000Z",
        });

        const expiryCleanup = pool.client.queries.find(({ statement }) =>
            statement.includes("UPDATE teapot_endorsement_intents"),
        );
        const duplicateLookup = pool.client.queries.find(({ statement }) =>
            statement.includes("FROM teapot_endorsement_intents intent"),
        );

        expect(expiryCleanup?.values).toEqual(["link-1", "endorser-1", "2026-08-09T12:00:00.000Z"]);
        expect(duplicateLookup?.statement).toContain("JOIN teapot_admission_links link");
        expect(duplicateLookup?.statement).toContain("link.revoked_at IS NULL");
        expect(duplicateLookup?.values).toEqual(["candidate-1", "endorser-1", "2026-08-09T12:00:00.000Z"]);
        expect(intent).toMatchObject({
            admissionLinkId: "link-1",
            candidateId: "candidate-1",
            endorserId: "endorser-1",
        });
    });
});
