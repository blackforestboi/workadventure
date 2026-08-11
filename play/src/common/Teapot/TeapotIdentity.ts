export const TEAPOT_ROLES = ["member", "creator", "moderator", "operator"] as const;

export type TeapotRole = (typeof TEAPOT_ROLES)[number];

export const TEAPOT_CAPABILITIES = [
    "world.enter",
    "asset.create",
    "asset.manage-own",
    "asset.manage-any",
    "map.edit",
    "map.publish",
    "map.manage-any",
    "mcp.connect",
    "mcp.approve",
    "endorsement.create",
    "identity.manage",
] as const;

export type TeapotCapability = (typeof TEAPOT_CAPABILITIES)[number];

export type TeapotAdmissionState = "pending" | "admitted" | "suspended";

export interface TeapotIdentity {
    id: string;
    displayName: string | null;
    admissionState: TeapotAdmissionState;
    createdAt: string;
    updatedAt: string;
}

export interface TeapotProviderLink {
    userId: string;
    provider: string;
    providerSubject: string;
    createdAt: string;
}

export interface TeapotIdentityContext {
    identity: TeapotIdentity;
    roles: TeapotRole[];
    capabilities: TeapotCapability[];
}
