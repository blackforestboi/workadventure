import { CredentialVaultError } from "./CredentialVaultError";
import type { VaultCryptoAdapter, VaultEncryptionKey } from "./CredentialVaultTypes";

class WebCryptoEncryptionKey implements VaultEncryptionKey {
    public readonly algorithm = "AES-GCM" as const;

    public constructor(public readonly key: CryptoKey) {}
}

export class WebCryptoVaultAdapter implements VaultCryptoAdapter {
    public constructor(private readonly webCrypto: Crypto = crypto) {}

    public randomBytes(length: number): Uint8Array {
        return this.webCrypto.getRandomValues(new Uint8Array(length));
    }

    public async deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<VaultEncryptionKey> {
        const passphraseBytes = new TextEncoder().encode(passphrase);
        const cryptoSalt = copyBytes(salt);
        try {
            const importedKey = await this.webCrypto.subtle.importKey("raw", passphraseBytes, "PBKDF2", false, [
                "deriveKey",
            ]);
            const derivedKey = await this.webCrypto.subtle.deriveKey(
                { name: "PBKDF2", salt: cryptoSalt, iterations, hash: "SHA-256" },
                importedKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"],
            );
            return new WebCryptoEncryptionKey(derivedKey);
        } finally {
            passphraseBytes.fill(0);
        }
    }

    public async encrypt(
        key: VaultEncryptionKey,
        iv: Uint8Array,
        plaintext: Uint8Array,
        additionalData: Uint8Array,
    ): Promise<Uint8Array> {
        const cryptoKey = this.unwrapKey(key);
        const cryptoIv = copyBytes(iv);
        const cryptoAdditionalData = copyBytes(additionalData);
        const cryptoPlaintext = copyBytes(plaintext);
        try {
            const ciphertext = await this.webCrypto.subtle.encrypt(
                { name: "AES-GCM", iv: cryptoIv, additionalData: cryptoAdditionalData, tagLength: 128 },
                cryptoKey,
                cryptoPlaintext,
            );
            return new Uint8Array(ciphertext);
        } finally {
            cryptoPlaintext.fill(0);
        }
    }

    public async decrypt(
        key: VaultEncryptionKey,
        iv: Uint8Array,
        ciphertext: Uint8Array,
        additionalData: Uint8Array,
    ): Promise<Uint8Array> {
        const cryptoKey = this.unwrapKey(key);
        const cryptoIv = copyBytes(iv);
        const cryptoAdditionalData = copyBytes(additionalData);
        const cryptoCiphertext = copyBytes(ciphertext);
        const plaintext = await this.webCrypto.subtle.decrypt(
            { name: "AES-GCM", iv: cryptoIv, additionalData: cryptoAdditionalData, tagLength: 128 },
            cryptoKey,
            cryptoCiphertext,
        );
        return new Uint8Array(plaintext);
    }

    private unwrapKey(key: VaultEncryptionKey): CryptoKey {
        if (!(key instanceof WebCryptoEncryptionKey)) {
            throw new CredentialVaultError("corrupted_record", "The credential vault encryption key is invalid.");
        }
        return key.key;
    }
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy;
}
