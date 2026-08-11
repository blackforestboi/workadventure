import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { PostgresPool, PostgresQueryResult, PostgresTransactionClient } from "./PostgresClient";

class NodePostgresTransactionClient implements PostgresTransactionClient {
    constructor(private readonly client: PoolClient) {}

    async query<Row extends object = Record<string, unknown>>(
        query: string,
        values?: readonly unknown[],
    ): Promise<PostgresQueryResult<Row>> {
        const result = await this.client.query<Row & QueryResultRow>(query, values === undefined ? [] : [...values]);
        return { rows: result.rows, rowCount: result.rowCount };
    }

    release(): void {
        this.client.release();
    }
}

/** Keeps node-postgres types at the runtime boundary of the Teapot repository. */
export class NodePostgresPoolAdapter implements PostgresPool {
    constructor(private readonly pool: Pool) {}

    async query<Row extends object = Record<string, unknown>>(
        query: string,
        values?: readonly unknown[],
    ): Promise<PostgresQueryResult<Row>> {
        const result = await this.pool.query<Row & QueryResultRow>(query, values === undefined ? [] : [...values]);
        return { rows: result.rows, rowCount: result.rowCount };
    }

    async connect(): Promise<PostgresTransactionClient> {
        return new NodePostgresTransactionClient(await this.pool.connect());
    }
}
