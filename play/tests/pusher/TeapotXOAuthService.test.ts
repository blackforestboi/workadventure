// @vitest-environment node
/* eslint-disable @typescript-eslint/require-await -- async test double implements the Fetch-compatible signature */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => import("./mocks/pusherEnvironmentVariableMock"));

import { JWTTokenManager } from "../../src/pusher/services/JWTTokenManager";
import { TeapotOAuthError } from "../../src/pusher/teapot/TeapotDataErrors";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";
import { TeapotSecretBox } from "../../src/pusher/teapot/TeapotTokenSecurity";
import { TeapotXOAuthService } from "../../src/pusher/teapot/TeapotXOAuthService";
import { XOAuthClient } from "../../src/pusher/teapot/XOAuthClient";
import { createTeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";

describe("TeapotXOAuthService", () => {
    it("authenticates encrypted PKCE verifier storage", () => {
        const box = new TeapotSecretBox("test-secret-at-least-sixteen-characters");
        const encrypted = box.encrypt("pkce-verifier");
        const tamperedParts = encrypted.split(".");
        const authenticationTag = tamperedParts[2] ?? "";
        tamperedParts[2] = `${authenticationTag.startsWith("A") ? "B" : "A"}${authenticationTag.slice(1)}`;

        expect(encrypted).not.toContain("pkce-verifier");
        expect(box.decrypt(encrypted)).toBe("pkce-verifier");
        expect(() => box.decrypt(tamperedParts.join("."))).toThrow();
    });

    it("uses PKCE, maps the stable X ID, revokes the X token, and returns only an application JWT", async () => {
        let nextId = 0;
        const repository = new InMemoryTeapotDataRepository({
            createId: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
            now: () => new Date("2026-08-09T10:00:00.000Z"),
        });
        const services = createTeapotDataServices(repository);
        const requests: Array<{ url: string; authorization?: string; body?: string }> = [];
        const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            requests.push({
                url,
                authorization: new Headers(init?.headers).get("authorization") ?? undefined,
                body:
                    typeof init?.body === "string"
                        ? init.body
                        : init?.body instanceof URLSearchParams
                          ? init.body.toString()
                          : undefined,
            });
            if (url.endsWith("/token")) {
                return new Response(JSON.stringify({ access_token: "raw-x-access-token", token_type: "bearer" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (url.includes("/users/me")) {
                return new Response(JSON.stringify({ data: { id: "x-user-42", name: "Priya", username: "priya" } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (url.endsWith("/revoke")) return new Response(null, { status: 200 });
            return new Response(null, { status: 404 });
        }) as typeof fetch;
        const xClient = new XOAuthClient({
            clientId: "x-client",
            clientSecret: "x-secret",
            fetch: request,
            authorizationEndpoint: "https://x.example.test/authorize",
            tokenEndpoint: "https://x.example.test/token",
            userEndpoint: "https://x.example.test/users/me",
            revocationEndpoint: "https://x.example.test/revoke",
        });
        const tokenValues = [
            "state-token-00000000000000000000000000000000",
            "verifier-token-0000000000000000000000000000",
        ];
        const jwt = new JWTTokenManager();
        const oauth = new TeapotXOAuthService(
            services,
            jwt,
            xClient,
            new TeapotSecretBox("test-secret-at-least-sixteen-characters"),
            {
                clientId: "x-client",
                redirectUri: "https://pusher.example.test/teapot/auth/x/callback",
                frontUrl: "https://play.example.test/",
                bootstrapXUserIds: ["x-user-42"],
                now: () => new Date("2026-08-09T10:00:00.000Z"),
                createToken: () => {
                    const value = tokenValues.shift();
                    if (value === undefined) throw new Error("No fixture token left");
                    return value;
                },
            },
        );

        const authorizationUrl = new URL(await oauth.begin("https://play.example.test/?room=teapot"));
        expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
        expect(authorizationUrl.searchParams.get("state")).toBe("state-token-00000000000000000000000000000000");

        const result = await oauth.complete("authorization-code", authorizationUrl.searchParams.get("state") ?? "");
        const appToken = new URL(result.redirectTo).searchParams.get("token");
        if (appToken === null) throw new Error("No application token returned");
        const tokenData = await jwt.verifyJWTToken(appToken);

        expect(tokenData).toMatchObject({ identifier: result.identity.id, authProvider: "x" });
        expect(tokenData.accessToken).toBeUndefined();
        expect(appToken).not.toContain("raw-x-access-token");
        expect(result.identity.admissionState).toBe("admitted");
        expect(await repository.listRoles(result.identity.id)).toContain("operator");
        expect(
            requests.some((entry) => entry.url.endsWith("/revoke") && entry.body?.includes("raw-x-access-token")),
        ).toBe(true);
        expect(await repository.findProviderLink("x", "x-user-42")).toMatchObject({ userId: result.identity.id });

        await expect(
            oauth.complete("authorization-code", authorizationUrl.searchParams.get("state") ?? ""),
        ).rejects.toBeInstanceOf(TeapotOAuthError);
    });

    it("rejects off-origin return URLs before creating state", async () => {
        const services = createTeapotDataServices(new InMemoryTeapotDataRepository());
        const oauth = new TeapotXOAuthService(
            services,
            new JWTTokenManager(),
            new XOAuthClient({ clientId: "x-client", fetch: vi.fn() as typeof fetch }),
            new TeapotSecretBox("test-secret-at-least-sixteen-characters"),
            {
                clientId: "x-client",
                redirectUri: "https://pusher.example.test/teapot/auth/x/callback",
                frontUrl: "https://play.example.test/",
            },
        );

        await expect(oauth.begin("https://evil.example.test/steal")).rejects.toBeInstanceOf(TeapotOAuthError);
        await expect(
            oauth.begin("https://play.example.test/#teapotInvite=must-stay-in-the-browser"),
        ).rejects.toBeInstanceOf(TeapotOAuthError);
    });
});
