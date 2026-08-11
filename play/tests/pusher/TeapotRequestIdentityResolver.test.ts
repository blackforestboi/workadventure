// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({ getTeapotDataServices: vi.fn() }));

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => ({
    MAP_EDITOR_ALLOWED_USERS: [],
    MAP_EDITOR_ALLOW_ALL_USERS: true,
}));
vi.mock("../../src/pusher/teapot/TeapotDataRuntime", () => runtimeMocks);

import { resolveTeapotRequestIdentity } from "../../src/pusher/teapot/TeapotRequestIdentityResolver";

describe("resolveTeapotRequestIdentity", () => {
    it("resolves email identifiers as provider subjects instead of querying a UUID primary key", async () => {
        const identity = { id: "25f0c786-e1d0-4c20-9d81-d2eeb7113bd0" };
        const getIdentity = vi.fn();
        const resolveProviderIdentity = vi.fn().mockResolvedValue(identity);
        runtimeMocks.getTeapotDataServices.mockReturnValue({
            repository: { getIdentity, addRole: vi.fn() },
            identity: { resolveProviderIdentity },
        });

        await expect(resolveTeapotRequestIdentity("john.doe@example.com")).resolves.toBe(identity);
        expect(getIdentity).not.toHaveBeenCalled();
        expect(resolveProviderIdentity).toHaveBeenCalledWith({
            provider: "workadventure",
            providerSubject: "john.doe@example.com",
        });
    });

    it("keeps resolving existing Teapot UUIDs directly", async () => {
        const identity = { id: "25f0c786-e1d0-4c20-9d81-d2eeb7113bd0" };
        const getIdentity = vi.fn().mockResolvedValue(identity);
        const addRole = vi.fn();
        const resolveProviderIdentity = vi.fn();
        runtimeMocks.getTeapotDataServices.mockReturnValue({
            repository: { getIdentity, addRole },
            identity: { resolveProviderIdentity },
        });

        await expect(resolveTeapotRequestIdentity(identity.id)).resolves.toBe(identity);
        expect(getIdentity).toHaveBeenCalledWith(identity.id);
        expect(resolveProviderIdentity).not.toHaveBeenCalled();
        expect(addRole).toHaveBeenCalledWith(identity.id, "creator");
    });

    it("does not grant the default creator role to a guest identity", async () => {
        const identity = { id: "25f0c786-e1d0-4c20-9d81-d2eeb7113bd0" };
        const addRole = vi.fn();
        runtimeMocks.getTeapotDataServices.mockReturnValue({
            repository: { getIdentity: vi.fn(), addRole },
            identity: { resolveProviderIdentity: vi.fn().mockResolvedValue(identity) },
        });

        await resolveTeapotRequestIdentity("anonymous-user", undefined, false);

        expect(addRole).not.toHaveBeenCalled();
    });
});
