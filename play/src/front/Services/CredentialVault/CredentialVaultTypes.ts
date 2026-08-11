import type { AssetGenerationProviderId } from "../AssetGeneration/AssetGenerationTypes";

export type CredentialVaultErrorCode =
    | "locked"
    | "invalid_passphrase"
    | "unlock_failed"
    | "credential_not_found"
    | "persistence_error"
    | "corrupted_record";

export interface CredentialSummary {
    providerId: string;
    label?: string;
    updatedAt: string;
}

export interface StoredCredentialVaultEnvelope {
    version: 1;
    kdf: {
        name: "PBKDF2";
        hash: "SHA-256";
        iterations: number;
        salt: string;
    };
    encryption: {
        name: "AES-GCM";
        iv: string;
    };
    ciphertext: string;
}

export interface EncryptedVaultStore {
    load(): Promise<StoredCredentialVaultEnvelope | null>;
    save(envelope: StoredCredentialVaultEnvelope): Promise<void>;
    delete(): Promise<void>;
}

export interface SessionCredentialDestination {
    configureCredential(providerId: AssetGenerationProviderId, credential: string): Promise<void>;
}

export interface VaultEncryptionKey {
    readonly algorithm: "AES-GCM";
}

export interface VaultCryptoAdapter {
    randomBytes(length: number): Uint8Array;
    deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<VaultEncryptionKey>;
    encrypt(
        key: VaultEncryptionKey,
        iv: Uint8Array,
        plaintext: Uint8Array,
        additionalData: Uint8Array,
    ): Promise<Uint8Array>;
    decrypt(
        key: VaultEncryptionKey,
        iv: Uint8Array,
        ciphertext: Uint8Array,
        additionalData: Uint8Array,
    ): Promise<Uint8Array>;
}
