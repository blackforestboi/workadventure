// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { TeapotAgentBridgeClient } from "../../src/pusher/teapot/TeapotAgentBridgeClient";

describe("TeapotAgentBridgeClient", () => {
    it("owner-scopes a device login without forwarding the raw Teapot identity", async () => {
        const fetcher = vi.fn(async () =>
            Response.json({
                pairingId: "pairing-123",
                verificationUrl: "https://auth.openai.com/codex/device",
                userCode: "ABCD-1234",
            }),
        );
        const client = new TeapotAgentBridgeClient(
            "http://agent-bridge:17373/",
            "bridge-secret-that-is-long-enough-for-tests",
            fetcher,
        );

        await expect(client.startOAuth("private-owner@example.test", "codex")).resolves.toMatchObject({
            pairingId: "pairing-123",
            authorizationUrl: "https://auth.openai.com/codex/device",
            mode: "device-code",
        });
        expect(fetcher).toHaveBeenCalledWith(
            "http://agent-bridge:17373/v1/oauth/codex/start",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer bridge-secret-that-is-long-enough-for-tests",
                    "X-Teapot-Owner": createHash("sha256").update("private-owner@example.test").digest("base64url"),
                }),
            }),
        );
        expect(JSON.stringify(fetcher.mock.calls)).not.toContain("private-owner@example.test");
    });

    it("fails closed when the internal bridge is not configured", async () => {
        const client = new TeapotAgentBridgeClient("", "");

        await expect(client.listModels("owner", "claude")).rejects.toMatchObject({ status: 503 });
    });

    it("adapts ordinary Codex agent models for the browser selector", async () => {
        const fetcher = vi.fn(async () =>
            Response.json({
                models: [
                    {
                        id: "gpt-5.1-codex-high",
                        model: "gpt-5.1-codex",
                        displayName: "GPT-5.1 Codex",
                        description: "Default agent model",
                    },
                ],
            }),
        );
        const client = new TeapotAgentBridgeClient("http://agent-bridge:17375", "bridge-secret", fetcher);

        await expect(client.listModels("owner", "codex")).resolves.toEqual([
            { id: "gpt-5.1-codex", name: "GPT-5.1 Codex", description: "Default agent model" },
        ]);
    });

    it("reports an already-authorized hosted account without a pairing ID", async () => {
        const fetcher = vi.fn(async () => Response.json({ connected: true }));
        const client = new TeapotAgentBridgeClient("http://agent-bridge:17375", "bridge-secret", fetcher);

        await expect(client.isConnected("owner", "codex")).resolves.toBe(true);
        expect(fetcher).toHaveBeenCalledWith(
            "http://agent-bridge:17375/v1/providers/codex/capabilities",
            expect.any(Object),
        );
    });
});
