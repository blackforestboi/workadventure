// @vitest-environment node

import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/services/JWTTokenManager", () => ({
    jwtTokenManager: { verifyJWTToken: vi.fn() },
}));

import { authenticated } from "../../src/pusher/middlewares/Authenticated";
import type { ResponseWithUserIdentifier } from "../../src/pusher/middlewares/Authenticated";
import { jwtTokenManager } from "../../src/pusher/services/JWTTokenManager";

afterEach(() => vi.clearAllMocks());

describe("authenticated Teapot provider context", () => {
    it("preserves the signed auth provider for the downstream authoring gate", async () => {
        vi.spyOn(jwtTokenManager, "verifyJWTToken").mockResolvedValue({
            identifier: "teapot-user-1",
            authProvider: "x",
        });
        const request = { header: () => "application-jwt" } as unknown as Request;
        const response = {} as ResponseWithUserIdentifier;
        const next = vi.fn();

        await authenticated(request, response, next);

        expect(response).toMatchObject({
            userIdentifier: "teapot-user-1",
            authProvider: "x",
            isLogged: true,
        } satisfies Partial<ResponseWithUserIdentifier>);
        expect(next).toHaveBeenCalledOnce();
    });
});
