export type LoginProvider = "x" | "openid" | undefined;

export function selectLoginProvider(config: {
    xClientId?: string;
    xRedirectUri?: string;
    frontUrl?: string;
    openIdClientId?: string;
    openIdIssuer?: string;
}): LoginProvider {
    if (config.xClientId && config.xRedirectUri && config.frontUrl) return "x";
    if (config.openIdClientId && config.openIdIssuer) return "openid";
    return undefined;
}
