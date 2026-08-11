import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  StdioCodexAppServerConnection,
  type CodexLoginCompleted,
} from "../src/codexAppServer.js";

describe("Codex app-server connection", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    tempDirectories.length = 0;
  });

  it("uses the official device-code, account, logout, and model RPCs", async () => {
    const root = await mkdtemp(join(tmpdir(), "teapot-app-server-test-"));
    tempDirectories.push(root);
    const executable = join(root, "fake-codex.mjs");
    await writeFile(executable, fakeCodexAppServer, { mode: 0o700 });
    await chmod(executable, 0o700);
    const connection = await StdioCodexAppServerConnection.create({
      codexHome: join(root, "account"),
      executable,
      requestTimeoutMs: 2_000,
    });
    const notifications: CodexLoginCompleted[] = [];
    const unsubscribe = connection.onLoginCompleted((event) =>
      notifications.push(event),
    );

    await expect(connection.readAccount()).resolves.toEqual({
      connected: false,
    });
    await expect(connection.startDeviceCodeLogin()).resolves.toEqual({
      loginId: "login-1",
      verificationUrl: "https://auth.example/device",
      userCode: "ABCD-EFGH",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(notifications).toEqual([
      { loginId: "login-1", success: true, error: null },
    ]);
    await expect(connection.readAccount()).resolves.toMatchObject({
      connected: true,
      accountType: "chatgpt",
      planType: "plus",
    });
    await expect(connection.listModels()).resolves.toEqual([
      {
        id: "gpt-test",
        model: "gpt-test",
        displayName: "GPT Test",
        description: "Fixture model",
        inputModalities: ["text", "image"],
        isDefault: true,
      },
    ]);
    await connection.logout();
    await expect(connection.readAccount()).resolves.toEqual({
      connected: false,
    });

    unsubscribe();
    await connection.close();
  });
});

const fakeCodexAppServer = `#!/usr/bin/env node
let connected = false;
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line.trim()) handle(JSON.parse(line));
    newline = buffer.indexOf("\\n");
  }
});
function send(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}
function handle(request) {
  if (request.method === "initialize") {
    send({ id: request.id, result: { codexHome: process.env.CODEX_HOME } });
    return;
  }
  if (request.method === "account/read") {
    send({
      id: request.id,
      result: {
        account: connected
          ? { type: "chatgpt", email: "not-exposed@example.test", planType: "plus" }
          : null,
        requiresOpenaiAuth: !connected,
      },
    });
    return;
  }
  if (request.method === "account/login/start") {
    connected = true;
    send({
      id: request.id,
      result: {
        type: "chatgptDeviceCode",
        loginId: "login-1",
        verificationUrl: "https://auth.example/device",
        userCode: "ABCD-EFGH",
      },
    });
    setImmediate(() =>
      send({
        method: "account/login/completed",
        params: { loginId: "login-1", success: true, error: null },
      }),
    );
    return;
  }
  if (request.method === "model/list") {
    send({
      id: request.id,
      result: {
        data: [
          {
            id: "gpt-test",
            model: "gpt-test",
            displayName: "GPT Test",
            description: "Fixture model",
            hidden: false,
            inputModalities: ["text", "image"],
            isDefault: true,
          },
        ],
        nextCursor: null,
      },
    });
    return;
  }
  if (request.method === "account/logout") {
    connected = false;
    send({ id: request.id, result: {} });
    return;
  }
  send({ id: request.id, error: { code: -32601, message: "not found" } });
}
`;
