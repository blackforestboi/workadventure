import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET_BOX_VERSION = "v1";

export function generateOpaqueToken(byteLength = 32): string {
    return encodeBase64Url(randomBytes(byteLength));
}

export function hashOpaqueToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
}

export function opaqueTokensEqual(left: string, right: string): boolean {
    const leftHash = Buffer.from(hashOpaqueToken(left), "hex");
    const rightHash = Buffer.from(hashOpaqueToken(right), "hex");
    return timingSafeEqual(leftHash, rightHash);
}

export function createPkceChallenge(codeVerifier: string): string {
    return encodeBase64Url(createHash("sha256").update(codeVerifier, "utf8").digest());
}

export class TeapotSecretBox {
    private readonly key: Buffer;

    constructor(secret: string) {
        if (secret.length === 0) {
            throw new Error("Teapot token encryption requires a server secret");
        }
        this.key = createHash("sha256").update(secret, "utf8").digest();
    }

    encrypt(value: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.key, iv);
        const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
        return [
            SECRET_BOX_VERSION,
            encodeBase64Url(iv),
            encodeBase64Url(cipher.getAuthTag()),
            encodeBase64Url(ciphertext),
        ].join(".");
    }

    decrypt(value: string): string {
        const [version, encodedIv, encodedTag, encodedCiphertext, unexpected] = value.split(".");
        if (
            version !== SECRET_BOX_VERSION ||
            encodedIv === undefined ||
            encodedTag === undefined ||
            encodedCiphertext === undefined ||
            unexpected !== undefined
        ) {
            throw new Error("Encrypted Teapot token has an unsupported format");
        }
        const decipher = createDecipheriv("aes-256-gcm", this.key, decodeBase64Url(encodedIv));
        decipher.setAuthTag(decodeBase64Url(encodedTag));
        return Buffer.concat([decipher.update(decodeBase64Url(encodedCiphertext)), decipher.final()]).toString("utf8");
    }
}

function encodeBase64Url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Buffer {
    if (!/^[A-Za-z0-9_-]*$/u.test(value) || value.length % 4 === 1) {
        throw new Error("Encrypted Teapot token contains invalid base64url data");
    }
    const base64 = value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Buffer.from(base64, "base64");
}
