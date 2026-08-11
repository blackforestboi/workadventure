// @vitest-environment node

import type { Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { TeapotIdentity } from "../../src/common/Teapot/TeapotIdentity";
import {
    assertTeapotMcpSessionAuthoringAccess,
    createTeapotAuthoringGate,
    type TeapotAuthoringAccessDependencies,
    type TeapotAuthoringAccessError,
} from "../../src/pusher/middlewares/TeapotAuthoringMiddleware";
import type { ResponseWithUserIdentifier } from "../../src/pusher/middlewares/Authenticated";
import { createTeapotDataServices, type TeapotDataServices } from "../../src/pusher/teapot/createTeapotDataServices";
import { InMemoryTeapotDataRepository } from "../../src/pusher/teapot/InMemoryTeapotDataRepository";

class AuthoringResponse {
    userIdentifier: string | undefined;
    authProvider: ResponseWithUserIdentifier["authProvider"];
    readonly headers = new Map<string, string>();
    readonly json = vi.fn();
    readonly locals = {};
    statusCode = 200;

    constructor(userIdentifier?: string, authProvider?: ResponseWithUserIdentifier["authProvider"]) {
        this.userIdentifier = userIdentifier;
        this.authProvider = authProvider;
    }

    setHeader(name: string, value: string): this {
        this.headers.set(name, value);
        return this;
    }

    status(statusCode: number): this {
        this.statusCode = statusCode;
        return this;
    }
}

function createFixture(xAdmissionConfigured: boolean): {
    repository: InMemoryTeapotDataRepository;
    services: TeapotDataServices;
    dependencies: TeapotAuthoringAccessDependencies;
} {
    const repository = new InMemoryTeapotDataRepository();
    const services = createTeapotDataServices(repository);
    return {
        repository,
        services,
        dependencies: {
            getDataServices: () => services,
            isXAdmissionConfigured: () => xAdmissionConfigured,
        },
    };
}

async function runGate(gate: RequestHandler, response: AuthoringResponse): Promise<ReturnType<typeof vi.fn>> {
    const next = vi.fn();
    await gate({} as Request, response as unknown as Response, next);
    return next;
}

async function createIdentity(
    services: TeapotDataServices,
    provider: string,
    providerSubject: string,
    admissionState: TeapotIdentity["admissionState"] = "pending",
): Promise<TeapotIdentity> {
    const identity = await services.identity.resolveProviderIdentity({ provider, providerSubject });
    return admissionState === "pending"
        ? identity
        : services.repository.updateAdmissionState(identity.id, admissionState);
}

describe("Teapot authoring access gate", () => {
    it("bypasses Teapot identity checks when X admission is not configured", async () => {
        const fixture = createFixture(false);
        const response = new AuthoringResponse("local-development-profile");

        const next = await runGate(createTeapotAuthoringGate(fixture.dependencies), response);

        expect(next).toHaveBeenCalledOnce();
        expect(response.statusCode).toBe(200);
        expect(await fixture.repository.getIdentity("local-development-profile")).toBeNull();
    });

    it("rejects non-X and forged X browser identities when admission is configured", async () => {
        const fixture = createFixture(true);
        const localIdentity = await createIdentity(fixture.services, "workadventure-jwt", "local-profile", "admitted");
        const gate = createTeapotAuthoringGate(fixture.dependencies);

        const nonXResponse = new AuthoringResponse(localIdentity.id, "openid");
        const nonXNext = await runGate(gate, nonXResponse);
        expect(nonXNext).not.toHaveBeenCalled();
        expect(nonXResponse.statusCode).toBe(401);
        expect(nonXResponse.json).toHaveBeenCalledWith(expect.objectContaining({ error: "x_authentication_required" }));

        const forgedXResponse = new AuthoringResponse(localIdentity.id, "x");
        const forgedXNext = await runGate(gate, forgedXResponse);
        expect(forgedXNext).not.toHaveBeenCalled();
        expect(forgedXResponse.statusCode).toBe(401);
        expect(forgedXResponse.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: "x_authentication_required" }),
        );
    });

    it("rejects pending and suspended X identities", async () => {
        const fixture = createFixture(true);
        const pending = await createIdentity(fixture.services, "x", "x-pending");
        const suspended = await createIdentity(fixture.services, "x", "x-suspended", "suspended");
        const gate = createTeapotAuthoringGate(fixture.dependencies);

        const pendingResponse = new AuthoringResponse(pending.id, "x");
        expect(await runGate(gate, pendingResponse)).not.toHaveBeenCalled();
        expect(pendingResponse.statusCode).toBe(403);
        expect(pendingResponse.json).toHaveBeenCalledWith(expect.objectContaining({ error: "admission_required" }));

        const suspendedResponse = new AuthoringResponse(suspended.id, "x");
        expect(await runGate(gate, suspendedResponse)).not.toHaveBeenCalled();
        expect(suspendedResponse.statusCode).toBe(403);
        expect(suspendedResponse.json).toHaveBeenCalledWith(expect.objectContaining({ error: "account_suspended" }));
    });

    it("admits X-linked members without granting missing authoring capabilities", async () => {
        const fixture = createFixture(true);
        const identity = await createIdentity(fixture.services, "x", "x-admitted", "admitted");
        const response = new AuthoringResponse(identity.id, "x");

        const next = await runGate(createTeapotAuthoringGate(fixture.dependencies), response);

        expect(next).toHaveBeenCalledOnce();
        expect(await fixture.repository.listRoles(identity.id)).toEqual(["member"]);
        await expect(fixture.services.authorization.hasCapability(identity.id, "map.edit")).resolves.toBe(false);
    });

    it("rechecks MCP session owners while preserving the unconfigured local bypass", async () => {
        const enabled = createFixture(true);
        const localIdentity = await createIdentity(enabled.services, "workadventure-jwt", "local", "admitted");
        const xIdentity = await createIdentity(enabled.services, "x", "x-session-owner", "admitted");

        await expect(
            assertTeapotMcpSessionAuthoringAccess(localIdentity.id, enabled.dependencies),
        ).rejects.toMatchObject({
            statusCode: 403,
            code: "x_authentication_required",
        } satisfies Partial<TeapotAuthoringAccessError>);
        await expect(assertTeapotMcpSessionAuthoringAccess(xIdentity.id, enabled.dependencies)).resolves.toMatchObject({
            id: xIdentity.id,
        });

        const disabled = createFixture(false);
        await expect(
            assertTeapotMcpSessionAuthoringAccess("unresolved-local-profile", disabled.dependencies),
        ).resolves.toBeUndefined();
    });
});
