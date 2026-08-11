// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemTeapotWokaObjectStore } from "../../src/pusher/teapot/TeapotWokaObjectStore";

describe("FileSystemTeapotWokaObjectStore", () => {
    let temporaryDirectory: string | undefined;

    afterEach(async () => {
        if (temporaryDirectory !== undefined) {
            await fs.rm(temporaryDirectory, { recursive: true, force: true });
        }
    });

    it("uses opaque immutable references and rejects path traversal", async () => {
        temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "teapot-woka-store-"));
        const store = new FileSystemTeapotWokaObjectStore(path.join(temporaryDirectory, "wokas"));
        const bytes = Buffer.from("png bytes");

        await store.initialize();
        const reference = await store.put(bytes);

        expect(reference).toMatch(/^[0-9a-f-]{36}\.png$/);
        await expect(store.get(reference)).resolves.toEqual(bytes);
        await expect(store.get("../outside.png")).rejects.toThrow("Invalid Woka object reference");
        await store.delete(reference);
        await expect(store.get(reference)).resolves.toBeNull();
    });
});
