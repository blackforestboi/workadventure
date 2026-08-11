/* eslint-disable @typescript-eslint/require-await -- in-memory object store implements an asynchronous storage contract */
/* eslint-disable no-await-in-loop -- deletion is intentionally serialized for deterministic object cleanup */

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const OBJECT_REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/i;

export interface TeapotWokaObjectStore {
    initialize(): Promise<void>;
    put(bytes: Buffer): Promise<string>;
    get(objectReference: string): Promise<Buffer | null>;
    delete(objectReference: string): Promise<void>;
}

export class InMemoryTeapotWokaObjectStore implements TeapotWokaObjectStore {
    private readonly objects = new Map<string, Buffer>();

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    async put(bytes: Buffer): Promise<string> {
        const reference = `${randomUUID()}.png`;
        this.objects.set(reference, Buffer.from(bytes));
        return reference;
    }

    async get(objectReference: string): Promise<Buffer | null> {
        const bytes = this.objects.get(objectReference);
        return bytes === undefined ? null : Buffer.from(bytes);
    }

    async delete(objectReference: string): Promise<void> {
        this.objects.delete(objectReference);
    }
}

/**
 * Stores immutable generated sprite sheets in a dedicated directory. Deployments should point this at a shared,
 * durable volume; the opaque references kept in PostgreSQL never contain user-provided path segments.
 */
export class FileSystemTeapotWokaObjectStore implements TeapotWokaObjectStore {
    constructor(private readonly rootDirectory: string) {}

    async initialize(): Promise<void> {
        await fs.mkdir(this.rootDirectory, { recursive: true, mode: 0o700 });
        await fs.access(this.rootDirectory, constants.R_OK | constants.W_OK | constants.X_OK);
    }

    async put(bytes: Buffer): Promise<string> {
        await this.initialize();
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const reference = `${randomUUID()}.png`;
            try {
                await fs.writeFile(this.pathFor(reference), bytes, { flag: "wx", mode: 0o600 });
                return reference;
            } catch (error: unknown) {
                if (isAlreadyExistsError(error)) continue;
                throw error;
            }
        }
        throw new Error("Could not allocate an immutable Woka object reference");
    }

    async get(objectReference: string): Promise<Buffer | null> {
        try {
            return Buffer.from(await fs.readFile(this.pathFor(objectReference)));
        } catch (error: unknown) {
            if (isNotFoundError(error)) return null;
            throw error;
        }
    }

    async delete(objectReference: string): Promise<void> {
        try {
            await fs.unlink(this.pathFor(objectReference));
        } catch (error: unknown) {
            if (!isNotFoundError(error)) throw error;
        }
    }

    private pathFor(objectReference: string): string {
        if (!OBJECT_REFERENCE_PATTERN.test(objectReference)) {
            throw new Error("Invalid Woka object reference");
        }
        return path.join(this.rootDirectory, objectReference);
    }
}

function isAlreadyExistsError(error: unknown): boolean {
    return isNodeErrorWithCode(error, "EEXIST");
}

function isNotFoundError(error: unknown): boolean {
    return isNodeErrorWithCode(error, "ENOENT");
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
