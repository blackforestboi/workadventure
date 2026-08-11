import type { NextFunction, Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { jwtTokenManager } from "../services/JWTTokenManager";
import type { AuthTokenData } from "../services/JWTTokenManager";

export type ResponseWithUserIdentifier = Response & {
    userIdentifier?: string;
    isLogged?: boolean;
    authProvider?: AuthTokenData["authProvider"];
    accessToken?: string;
    username?: string;
    tags?: string[];
};

export async function authenticated(req: Request, res: ResponseWithUserIdentifier, next: NextFunction): Promise<void> {
    const token = req.header("authorization");
    if (!token) {
        res.status(401).send("Missing authorization header");
        return;
    }

    try {
        const jwtData = await jwtTokenManager.verifyJWTToken(token);
        // Let's set the "uuid" param
        res.userIdentifier = jwtData.identifier;
        res.isLogged = !!jwtData.accessToken || jwtData.authProvider !== undefined;
        res.authProvider = jwtData.authProvider;
        res.accessToken = jwtData.accessToken;
        res.username = jwtData.username;
        res.tags = jwtData.tags;
    } catch (e) {
        // Authorization tokens are credentials. Record the failure without ever
        // interpolating the bearer value into logs or error telemetry.
        Sentry.captureException(e, { tags: { authentication: "invalid-bearer" } });
        console.error("Connection refused for an invalid authorization token", e);

        res.status(401).send("Invalid token sent");
        return;
    }

    next();
}
