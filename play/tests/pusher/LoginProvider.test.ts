// @vitest-environment node

import { describe, expect, it } from "vitest";

import { selectLoginProvider } from "../../src/pusher/services/LoginProvider";

describe("selectLoginProvider", () => {
    it("prefers the configured X provider", () => {
        expect(
            selectLoginProvider({
                xClientId: "x-client",
                xRedirectUri: "https://play.test/teapot/auth/x/callback",
                frontUrl: "https://play.test",
                openIdClientId: "openid-client",
                openIdIssuer: "https://identity.test",
            }),
        ).toBe("x");
    });

    it("uses OpenID only when its client and issuer are both configured", () => {
        expect(
            selectLoginProvider({ openIdClientId: "openid-client", openIdIssuer: "https://identity.test" }),
        ).toBe("openid");
        expect(selectLoginProvider({ openIdClientId: "openid-client" })).toBeUndefined();
    });
});
