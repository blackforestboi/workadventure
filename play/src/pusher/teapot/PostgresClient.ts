export interface PostgresQueryResult<Row> {
    rows: Row[];
    rowCount: number | null;
}

export interface PostgresQueryable {
    query<Row extends object = Record<string, unknown>>(
        query: string,
        values?: readonly unknown[],
    ): Promise<PostgresQueryResult<Row>>;
}

export interface PostgresTransactionClient extends PostgresQueryable {
    release(): void;
}

/** Structurally compatible with a node-postgres Pool through a one-line adapter. */
export interface PostgresPool extends PostgresQueryable {
    connect(): Promise<PostgresTransactionClient>;
}

export async function withPostgresTransaction<T>(
    pool: PostgresPool,
    operation: (client: PostgresTransactionClient) => Promise<T>,
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
    } catch (error: unknown) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
