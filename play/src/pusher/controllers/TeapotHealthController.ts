import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import type { Application } from "express";

import { TEAPOT_REQUIRE_PERSISTENCE, TEAPOT_WOKA_STORAGE_DIRECTORY } from "../enums/EnvironmentVariable";
import { getTeapotDataRuntimeStatus, getTeapotDataServices } from "../teapot/TeapotDataRuntime";
import { BaseHttpController } from "./BaseHttpController";

const HEALTH_TIMEOUT_MS = 2_000;
const HEALTH_PROBE_IDENTITY_ID = "00000000-0000-0000-0000-000000000000";

export class TeapotHealthController extends BaseHttpController {
    public constructor(app: Application) {
        super(app);
    }

    protected routes(): void {
        this.app.get("/teapot/health/ready", async (_req, res) => {
            res.setHeader("Cache-Control", "no-store");
            try {
                await withTimeout(
                    Promise.all([
                        getTeapotDataServices().repository.getIdentity(HEALTH_PROBE_IDENTITY_ID),
                        ensureAssetDirectoryReady(),
                    ]),
                );
                const runtime = getTeapotDataRuntimeStatus();
                if (TEAPOT_REQUIRE_PERSISTENCE && !runtime.durable) {
                    res.status(503).json({ ready: false, data: "volatile", assets: "ready" });
                    return;
                }
                res.status(200).json({ ready: true, data: runtime.durable ? "durable" : "volatile", assets: "ready" });
            } catch (error: unknown) {
                console.error("Teapot readiness check failed", error);
                res.status(503).json({ ready: false, data: "unavailable", assets: "unavailable" });
            }
        });
    }
}

async function ensureAssetDirectoryReady(): Promise<void> {
    await fs.mkdir(TEAPOT_WOKA_STORAGE_DIRECTORY, { recursive: true, mode: 0o700 });
    await fs.access(TEAPOT_WOKA_STORAGE_DIRECTORY, fsConstants.R_OK | fsConstants.W_OK);
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error("Teapot readiness timed out")), HEALTH_TIMEOUT_MS);
                timeout.unref?.();
            }),
        ]);
    } finally {
        if (timeout !== undefined) clearTimeout(timeout);
    }
}
