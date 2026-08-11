/* eslint-disable @typescript-eslint/require-await -- synchronous test doubles implement asynchronous vault contracts */

import { describe, expect, it } from "vitest";
import { decodeBase64, encodeBase64 } from "../../../../src/front/Services/AssetGeneration/Base64";
import { EncryptedCredentialVault } from "../../../../src/front/Services/CredentialVault/EncryptedCredentialVault";
import type {
    EncryptedVaultStore,
    StoredCredentialVaultEnvelope,
    VaultCryptoAdapter,
    VaultEncryptionKey,
} from "../../../../src/front/Services/CredentialVault/CredentialVaultTypes";

describe("EncryptedCredentialVault", () => {
    it("unlocks, saves, relocks, and unlocks without plaintext at rest", async () => {
        const store = new MemoryEncryptedVaultStore();
        const cryptoAdapter = new AuthenticatedFakeCryptoAdapter();
        const vault = createVault(store, cryptoAdapter);
        const secret = "sk-or-private-provider-key";

        await vault.unlock("correct horse battery staple");
        await vault.save("openrouter", secret, "Personal OpenRouter");

        expect(vault.list()).toEqual([
            { providerId: "openrouter", label: "Personal OpenRouter", updatedAt: "2026-08-09T12:00:00.000Z" },
        ]);
        expect(JSON.stringify(store.envelope)).not.toContain(secret);
        let provisionedCredential = "";
        await vault.provisionSessionCredential("openrouter", {
            configureCredential: async (_providerId, credential) => {
                provisionedCredential = credential;
            },
        });
        expect(provisionedCredential).toBe(secret);

        vault.lock();
        expect(vault.isUnlocked).toBe(false);
        expect(() => vault.list()).toThrow("Unlock");

        const reloadedVault = createVault(store, cryptoAdapter);
        await reloadedVault.unlock("correct horse battery staple");
        let reloadedCredential = "";
        await reloadedVault.provisionSessionCredential("openrouter", {
            configureCredential: async (_providerId, credential) => {
                reloadedCredential = credential;
            },
        });
        expect(reloadedCredential).toBe(secret);
    });

    it("rejects a wrong password without exposing saved credentials", async () => {
        const store = new MemoryEncryptedVaultStore();
        const cryptoAdapter = new AuthenticatedFakeCryptoAdapter();
        const vault = createVault(store, cryptoAdapter);
        await vault.unlock("correct password");
        await vault.save("openrouter", "private-secret");
        vault.lock();

        await expect(vault.unlock("wrong password")).rejects.toMatchObject({ code: "unlock_failed" });
        expect(vault.isUnlocked).toBe(false);
        expect(JSON.stringify(store.envelope)).not.toContain("private-secret");
    });

    it("rejects corrupted authenticated ciphertext", async () => {
        const store = new MemoryEncryptedVaultStore();
        const cryptoAdapter = new AuthenticatedFakeCryptoAdapter();
        const vault = createVault(store, cryptoAdapter);
        await vault.unlock("correct password");
        await vault.save("openrouter", "private-secret");
        vault.lock();
        store.corruptCiphertext();

        await expect(vault.unlock("correct password")).rejects.toMatchObject({ code: "unlock_failed" });
        expect(vault.isUnlocked).toBe(false);
    });

    it("deletes one credential and can delete the entire encrypted vault", async () => {
        const store = new MemoryEncryptedVaultStore();
        const vault = createVault(store, new AuthenticatedFakeCryptoAdapter());
        await vault.unlock("correct password");
        await vault.save("openrouter", "private-secret");

        await expect(vault.delete("openrouter")).resolves.toBe(true);
        expect(vault.list()).toEqual([]);
        await vault.deleteVault();

        expect(store.envelope).toBeNull();
        expect(vault.isUnlocked).toBe(false);
    });
});

function createVault(store: EncryptedVaultStore, cryptoAdapter: VaultCryptoAdapter): EncryptedCredentialVault {
    return new EncryptedCredentialVault({
        store,
        cryptoAdapter,
        now: () => "2026-08-09T12:00:00.000Z",
    });
}

class MemoryEncryptedVaultStore implements EncryptedVaultStore {
    public envelope: StoredCredentialVaultEnvelope | null = null;

    public async load(): Promise<StoredCredentialVaultEnvelope | null> {
        return this.envelope === null ? null : structuredClone(this.envelope);
    }

    public async save(envelope: StoredCredentialVaultEnvelope): Promise<void> {
        this.envelope = structuredClone(envelope);
    }

    public async delete(): Promise<void> {
        this.envelope = null;
    }

    public corruptCiphertext(): void {
        if (this.envelope === null) throw new Error("No vault exists");
        const bytes = decodeBase64(this.envelope.ciphertext);
        bytes[bytes.length - 1] ^= 0xff;
        this.envelope.ciphertext = encodeBase64(bytes);
    }
}

class FakeEncryptionKey implements VaultEncryptionKey {
    public readonly algorithm = "AES-GCM" as const;

    public constructor(public readonly fingerprint: number) {}
}

class AuthenticatedFakeCryptoAdapter implements VaultCryptoAdapter {
    private randomCounter = 0;

    public randomBytes(length: number): Uint8Array {
        return Uint8Array.from({ length }, () => {
            this.randomCounter = (this.randomCounter + 17) & 0xff;
            return this.randomCounter;
        });
    }

    public async deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<VaultEncryptionKey> {
        return new FakeEncryptionKey(checksum(new TextEncoder().encode(passphrase), salt, numberBytes(iterations)));
    }

    public async encrypt(
        key: VaultEncryptionKey,
        iv: Uint8Array,
        plaintext: Uint8Array,
        additionalData: Uint8Array,
    ): Promise<Uint8Array> {
        const fakeKey = requireFakeKey(key);
        const encrypted = plaintext.map((byte, index) => byte ^ keyByte(fakeKey, iv, index));
        const tag = numberBytes(checksum(numberBytes(fakeKey.fingerprint), iv, additionalData, plaintext));
        const result = new Uint8Array(tag.length + encrypted.length);
        result.set(tag);
        result.set(encrypted, tag.length);
        return result;
    }

    public async decrypt(
        key: VaultEncryptionKey,
        iv: Uint8Array,
        ciphertext: Uint8Array,
        additionalData: Uint8Array,
    ): Promise<Uint8Array> {
        const fakeKey = requireFakeKey(key);
        if (ciphertext.length < 4) throw new Error("Invalid authenticated ciphertext");
        const receivedTag = ciphertext.slice(0, 4);
        const encrypted = ciphertext.slice(4);
        const plaintext = encrypted.map((byte, index) => byte ^ keyByte(fakeKey, iv, index));
        const expectedTag = numberBytes(checksum(numberBytes(fakeKey.fingerprint), iv, additionalData, plaintext));
        if (!receivedTag.every((byte, index) => byte === expectedTag[index])) {
            plaintext.fill(0);
            throw new Error("Authentication failed");
        }
        return plaintext;
    }
}

function requireFakeKey(key: VaultEncryptionKey): FakeEncryptionKey {
    if (!(key instanceof FakeEncryptionKey)) throw new Error("Unexpected key type");
    return key;
}

function keyByte(key: FakeEncryptionKey, iv: Uint8Array, index: number): number {
    return ((key.fingerprint >>> ((index % 4) * 8)) & 0xff) ^ iv[index % iv.length];
}

function checksum(...parts: readonly Uint8Array[]): number {
    let hash = 2166136261;
    for (const part of parts) {
        for (const byte of part) {
            hash ^= byte;
            hash = Math.imul(hash, 16777619);
        }
    }
    return hash >>> 0;
}

function numberBytes(value: number): Uint8Array {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}
