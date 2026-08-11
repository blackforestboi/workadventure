import type { RequestHandler } from "express";

import type { TeapotCapability, TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import type { TeapotDataServices } from "../teapot/createTeapotDataServices";
import type { JWTTokenManager } from "../services/JWTTokenManager";

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- Express uses namespace declaration merging for Locals
    namespace Express {
        interface Locals {
            teapotIdentity: TeapotIdentity;
        }
    }
}

export function createTeapotAuthenticatedMiddleware(
    jwtTokenManager: JWTTokenManager,
    services: TeapotDataServices,
): RequestHandler {
    return async (req, res, next) => {
        const authorization = req.header("authorization");
        const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : authorization;
        if (!token) {
            res.status(401).json({ error: "authentication_required" });
            return;
        }
        try {
            const tokenData = await jwtTokenManager.verifyJWTToken(token);
            if (tokenData.authProvider !== "x") {
                res.status(401).json({ error: "x_authentication_required" });
                return;
            }
            const identity = await services.repository.getIdentity(tokenData.identifier);
            if (identity === null) {
                res.status(401).json({ error: "identity_not_found" });
                return;
            }
            res.locals.teapotIdentity = identity;
            next();
        } catch {
            res.status(401).json({ error: "invalid_authentication" });
        }
    };
}

export function createTeapotCapabilityMiddleware(
    services: TeapotDataServices,
    capability: TeapotCapability,
): RequestHandler {
    return async (_req, res, next) => {
        try {
            await services.authorization.assertCapability(res.locals.teapotIdentity.id, capability);
            next();
        } catch {
            res.status(403).json({ error: "capability_required", capability });
        }
    };
}
