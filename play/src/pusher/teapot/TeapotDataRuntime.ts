import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import {
    TEAPOT_DATABASE_URL,
    TEAPOT_MIGRATIONS_DIRECTORY,
    TEAPOT_REQUIRE_PERSISTENCE,
} from "../enums/EnvironmentVariable";
import { InMemoryTeapotDataRepository } from "./InMemoryTeapotDataRepository";
import { NodePostgresPoolAdapter } from "./NodePostgresPoolAdapter";
import { PostgresMigrationRunner } from "./PostgresMigrationRunner";
import { PostgresTeapotDataRepository } from "./PostgresTeapotDataRepository";
import { createTeapotDataServices } from "./createTeapotDataServices";
import type { TeapotDataServices } from "./createTeapotDataServices";

let services = createTeapotDataServices(new InMemoryTeapotDataRepository());
let initialization: Promise<void> | undefined;
let postgresPool: Pool | undefined;
let durable = false;

export interface TeapotDataRuntimeStatus {
    initialized: boolean;
    durable: boolean;
}

export function getTeapotDataServices(): TeapotDataServices {
    return services;
}

export function getTeapotDataRuntimeStatus(): TeapotDataRuntimeStatus {
    return { initialized: initialization !== undefined, durable };
}

export function initializeTeapotDataRuntime(): Promise<void> {
    initialization ??= initialize();
    return initialization;
}

export async function closeTeapotDataRuntime(): Promise<void> {
    const pool = postgresPool;
    postgresPool = undefined;
    await pool?.end();
    durable = false;
    initialization = undefined;
}

async function initialize(): Promise<void> {
    if (!TEAPOT_DATABASE_URL) {
        if (TEAPOT_REQUIRE_PERSISTENCE) {
            throw new Error("TEAPOT_DATABASE_URL is required when TEAPOT_REQUIRE_PERSISTENCE is enabled");
        }
        console.warn("Teapot data is using volatile in-memory storage; configure TEAPOT_DATABASE_URL for persistence");
        return;
    }

    const pool = new Pool({
        connectionString: TEAPOT_DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        application_name: "teapot-maps-pusher",
    });
    const adapter = new NodePostgresPoolAdapter(pool);
    await adapter.query("SELECT 1");
    await new PostgresMigrationRunner(adapter, resolveMigrationsDirectory()).migrate();

    postgresPool = pool;
    services = createTeapotDataServices(new PostgresTeapotDataRepository(adapter));
    durable = true;
}

function resolveMigrationsDirectory(): string {
    if (TEAPOT_MIGRATIONS_DIRECTORY) {
        return path.resolve(TEAPOT_MIGRATIONS_DIRECTORY);
    }

    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.join(moduleDirectory, "migrations"),
        path.resolve("src/pusher/teapot/migrations"),
        path.resolve("pusher/teapot/migrations"),
    ];
    const migrationsDirectory = candidates.find((candidate) => existsSync(candidate));
    if (migrationsDirectory === undefined) {
        throw new Error("Cannot find Teapot database migrations; set TEAPOT_MIGRATIONS_DIRECTORY");
    }
    return migrationsDirectory;
}
