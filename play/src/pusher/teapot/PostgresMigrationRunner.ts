/* eslint-disable no-await-in-loop -- migrations must execute and record in deterministic order */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { TeapotDataConflictError } from "./TeapotDataErrors";
import type { PostgresPool } from "./PostgresClient";
import { withPostgresTransaction } from "./PostgresClient";

interface AppliedMigrationRow {
    id: string;
    checksum: string;
}

export class PostgresMigrationRunner {
    constructor(
        private readonly pool: PostgresPool,
        private readonly migrationsDirectory: string,
    ) {}

    async migrate(): Promise<void> {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS teapot_schema_migrations (
                id text PRIMARY KEY,
                checksum text NOT NULL,
                applied_at timestamptz NOT NULL
            )
        `);
        const migrationFiles = (await readdir(this.migrationsDirectory))
            .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/.test(fileName))
            .sort();
        const appliedResult = await this.pool.query<AppliedMigrationRow>(
            "SELECT id, checksum FROM teapot_schema_migrations ORDER BY id",
        );
        const applied = new Map(appliedResult.rows.map((migration) => [migration.id, migration.checksum]));

        for (const fileName of migrationFiles) {
            const sql = await readFile(path.join(this.migrationsDirectory, fileName), "utf8");
            const checksum = createHash("sha256").update(sql).digest("hex");
            const existingChecksum = applied.get(fileName);
            if (existingChecksum !== undefined) {
                if (existingChecksum !== checksum) {
                    throw new TeapotDataConflictError(`Applied migration ${fileName} has changed on disk`);
                }
                continue;
            }

            await withPostgresTransaction(this.pool, async (client) => {
                await client.query(sql);
                await client.query(
                    "INSERT INTO teapot_schema_migrations (id, checksum, applied_at) VALUES ($1, $2, $3)",
                    [fileName, checksum, new Date().toISOString()],
                );
            });
        }
    }
}
