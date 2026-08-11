import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import type { AuthTokenData } from "../services/JWTTokenManager";
import type { TeapotDataServices } from "../teapot/createTeapotDataServices";
import type { ResponseWithUserIdentifier } from "./Authenticated";

export type TeapotAuthoringAccessErrorCode = "x_authentication_required" | "admission_required" | "account_suspended";

export class TeapotAuthoringAccessError extends Error {
    constructor(
        readonly statusCode: 401 | 403,
        readonly code: TeapotAuthoringAccessErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "TeapotAuthoringAccessError";
    }
}

export interface TeapotAuthoringAccessDependencies {
    getDataServices: () => TeapotDataServices;
    isXAdmissionConfigured: () => boolean;
}

let configuredDependencies: TeapotAuthoringAccessDependencies | undefined;

/** Configured once by the pusher app; keeping env/runtime imports out makes the policy independently testable. */
export function configureTeapotAuthoringAccess(dependencies: TeapotAuthoringAccessDependencies): void {
    configuredDependencies = dependencies;
}

/**
 * Browser authoring boundary. The generic WorkAdventure JWT middleware must run first.
 * Local identities remain supported only while X admission is not configured.
 */
export function createTeapotAuthoringGate(dependencies?: TeapotAuthoringAccessDependencies): RequestHandler {
    return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
        const authenticatedResponse = res as ResponseWithUserIdentifier;
        try {
            await assertTeapotBrowserAuthoringAccess(
                authenticatedResponse.userIdentifier,
                authenticatedResponse.authProvider,
                resolveDependencies(dependencies),
            );
            next();
        } catch (error: unknown) {
            if (sendTeapotAuthoringAccessError(res, error)) return;
            next(error);
        }
    };
}

export const teapotAuthoringGate = createTeapotAuthoringGate();

export async function assertTeapotBrowserAuthoringAccess(
    userId: string | undefined,
    authProvider: AuthTokenData["authProvider"],
    dependencies?: TeapotAuthoringAccessDependencies,
): Promise<TeapotIdentity | undefined> {
    const resolvedDependencies = resolveDependencies(dependencies);
    if (!resolvedDependencies.isXAdmissionConfigured()) return undefined;
    if (!userId || authProvider !== "x") {
        throw new TeapotAuthoringAccessError(
            401,
            "x_authentication_required",
            "X authentication is required for Teapot authoring",
        );
    }
    return requireAdmittedXIdentity(userId, 401, resolvedDependencies);
}

/** Rechecks the owner behind an MCP bearer session, including sessions issued before a config/state change. */
export async function assertTeapotMcpSessionAuthoringAccess(
    userId: string,
    dependencies?: TeapotAuthoringAccessDependencies,
): Promise<TeapotIdentity | undefined> {
    const resolvedDependencies = resolveDependencies(dependencies);
    if (!resolvedDependencies.isXAdmissionConfigured()) return undefined;
    return requireAdmittedXIdentity(userId, 403, resolvedDependencies);
}

export function sendTeapotAuthoringAccessError(res: Response, error: unknown): boolean {
    if (!(error instanceof TeapotAuthoringAccessError)) return false;
    res.setHeader("Cache-Control", "no-store");
    res.status(error.statusCode).json({ error: error.code, message: error.message });
    return true;
}

async function requireAdmittedXIdentity(
    userId: string,
    missingIdentityStatus: 401 | 403,
    dependencies: TeapotAuthoringAccessDependencies,
): Promise<TeapotIdentity> {
    const services = dependencies.getDataServices();
    const [identity, hasXProvider] = await Promise.all([
        services.repository.getIdentity(userId),
        services.repository.hasProviderLink(userId, "x"),
    ]);
    if (identity === null || !hasXProvider) {
        throw new TeapotAuthoringAccessError(
            missingIdentityStatus,
            "x_authentication_required",
            "An X-linked Teapot identity is required for authoring",
        );
    }
    if (identity.admissionState === "suspended") {
        throw new TeapotAuthoringAccessError(403, "account_suspended", "This Teapot account is suspended");
    }
    if (identity.admissionState !== "admitted") {
        throw new TeapotAuthoringAccessError(
            403,
            "admission_required",
            "Three endorsements are required before authoring",
        );
    }
    return identity;
}

function resolveDependencies(
    dependencies: TeapotAuthoringAccessDependencies | undefined,
): TeapotAuthoringAccessDependencies {
    const resolved = dependencies ?? configuredDependencies;
    if (resolved === undefined) {
        throw new Error("Teapot authoring access was not configured by the pusher application");
    }
    return resolved;
}
