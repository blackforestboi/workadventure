import { decodeBase64, encodeBase64 } from "../AssetGeneration/Base64";
import type { AssetGenerationProviderId } from "../AssetGeneration/AssetGenerationTypes";
import { CredentialVaultError } from "./CredentialVaultError";
import type {
    CredentialSummary,
    EncryptedVaultStore,
    SessionCredentialDestination,
    StoredCredentialVaultEnvelope,
    VaultCryptoAdapter,
    VaultEncryptionKey,
} from "./CredentialVaultTypes";
import { IndexedDbEncryptedVaultStore } from "./IndexedDbEncryptedVaultStore";
import { WebCryptoVaultAdapter } from "./WebCryptoVaultAdapter";

const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

interface CredentialRecord {
    providerId: string;
    secret: string;
    label?: string;
    updatedAt: string;
}

interface VaultPayload {
    version: 1;
    credentials: CredentialRecord[];
}

interface EncryptedCredentialVaultOptions {
    store?: EncryptedVaultStore;
    cryptoAdapter?: VaultCryptoAdapter;
    now?: () => string;
}

export class EncryptedCredentialVault {
    private readonly store: EncryptedVaultStore;
    private readonly cryptoAdapter: VaultCryptoAdapter;
    private readonly now: () => string;
    private credentials = new Map<string, CredentialRecord>();
    private encryptionKey: VaultEncryptionKey | null = null;
    private envelope: StoredCredentialVaultEnvelope | null = null;

    public constructor(options: EncryptedCredentialVaultOptions = {}) {
        this.store = options.store ?? new IndexedDbEncryptedVaultStore();
        this.cryptoAdapter = options.cryptoAdapter ?? new WebCryptoVaultAdapter();
        this.now = options.now ?? (() => new Date().toISOString());
    }

    public get isUnlocked(): boolean {
        return this.encryptionKey !== null;
    }

    public async hasPersistedVault(): Promise<boolean> {
        return (await this.store.load()) !== null;
    }

    public async unlock(passphrase: string): Promise<void> {
        if (passphrase.length === 0) {
            throw new CredentialVaultError("invalid_passphrase", "A vault passphrase is required.");
        }

        this.clearMemory();
        const storedEnvelope = await this.store.load();
        if (storedEnvelope === null) {
            await this.initialize(passphrase);
            return;
        }

        try {
            validateEnvelope(storedEnvelope);
            const salt = decodeBase64(storedEnvelope.kdf.salt);
            const iv = decodeBase64(storedEnvelope.encryption.iv);
            const ciphertext = decodeBase64(storedEnvelope.ciphertext);
            if (salt.byteLength !== SALT_BYTES || iv.byteLength !== IV_BYTES || ciphertext.byteLength < 16) {
                throw new CredentialVaultError("corrupted_record", "The stored credential vault is invalid.");
            }
            const key = await this.cryptoAdapter.deriveKey(passphrase, salt, storedEnvelope.kdf.iterations);
            const plaintext = await this.cryptoAdapter.decrypt(
                key,
                iv,
                ciphertext,
                envelopeAdditionalData(storedEnvelope),
            );
            try {
                const payload = parseVaultPayload(new TextDecoder().decode(plaintext));
                this.credentials = new Map(
                    payload.credentials.map((credential) => [credential.providerId, credential]),
                );
                this.encryptionKey = key;
                this.envelope = storedEnvelope;
            } finally {
                plaintext.fill(0);
            }
        } catch {
            this.clearMemory();
            throw new CredentialVaultError(
                "unlock_failed",
                "The vault could not be unlocked. Check the passphrase or restore a valid backup.",
            );
        }
    }

    public lock(): void {
        this.clearMemory();
    }

    public clearMemory(): void {
        this.credentials.clear();
        this.credentials = new Map();
        this.encryptionKey = null;
        this.envelope = null;
    }

    public list(): readonly CredentialSummary[] {
        this.assertUnlocked();
        return [...this.credentials.values()]
            .map(({ providerId, label, updatedAt }) => ({ providerId, label, updatedAt }))
            .sort((left, right) => left.providerId.localeCompare(right.providerId));
    }

    public async save(providerId: string, secret: string, label?: string): Promise<void> {
        this.assertUnlocked();
        if (providerId.trim() === "" || secret.trim() === "") {
            throw new CredentialVaultError("credential_not_found", "A provider and credential are required.");
        }

        const previousCredentials = new Map(this.credentials);
        this.credentials.set(providerId, { providerId, secret, label, updatedAt: this.now() });
        try {
            await this.persistUnlocked();
        } catch (error: unknown) {
            this.credentials = previousCredentials;
            throw error;
        }
    }

    public async delete(providerId: string): Promise<boolean> {
        this.assertUnlocked();
        if (!this.credentials.has(providerId)) return false;

        const previousCredentials = new Map(this.credentials);
        this.credentials.delete(providerId);
        try {
            await this.persistUnlocked();
            return true;
        } catch (error: unknown) {
            this.credentials = previousCredentials;
            throw error;
        }
    }

    public async deleteVault(): Promise<void> {
        try {
            await this.store.delete();
        } finally {
            this.clearMemory();
        }
    }

    public async provisionSessionCredential(
        providerId: AssetGenerationProviderId,
        destination: SessionCredentialDestination,
    ): Promise<void> {
        this.assertUnlocked();
        const credential = this.credentials.get(providerId);
        if (credential === undefined) {
            throw new CredentialVaultError("credential_not_found", "No saved credential exists for this provider.");
        }
        await destination.configureCredential(providerId, credential.secret);
    }

    private async initialize(passphrase: string): Promise<void> {
        const salt = this.cryptoAdapter.randomBytes(SALT_BYTES);
        const key = await this.cryptoAdapter.deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
        this.encryptionKey = key;
        this.envelope = createEmptyEnvelope(salt);
        this.credentials = new Map();
        try {
            await this.persistUnlocked();
        } catch (error: unknown) {
            this.clearMemory();
            throw error;
        }
    }

    private async persistUnlocked(): Promise<void> {
        this.assertUnlocked();
        if (this.envelope === null || this.encryptionKey === null) {
            throw new CredentialVaultError("locked", "Unlock the credential vault first.");
        }

        const nextEnvelope: StoredCredentialVaultEnvelope = {
            ...this.envelope,
            encryption: { name: "AES-GCM", iv: encodeBase64(this.cryptoAdapter.randomBytes(IV_BYTES)) },
            ciphertext: "",
        };
        const plaintext = new TextEncoder().encode(
            JSON.stringify({
                version: VAULT_VERSION,
                credentials: [...this.credentials.values()],
            } satisfies VaultPayload),
        );
        try {
            const ciphertext = await this.cryptoAdapter.encrypt(
                this.encryptionKey,
                decodeBase64(nextEnvelope.encryption.iv),
                plaintext,
                envelopeAdditionalData(nextEnvelope),
            );
            nextEnvelope.ciphertext = encodeBase64(ciphertext);
            await this.store.save(nextEnvelope);
            this.envelope = nextEnvelope;
        } finally {
            plaintext.fill(0);
        }
    }

    private assertUnlocked(): void {
        if (!this.isUnlocked) {
            throw new CredentialVaultError("locked", "Unlock the credential vault first.");
        }
    }
}

function createEmptyEnvelope(salt: Uint8Array): StoredCredentialVaultEnvelope {
    return {
        version: VAULT_VERSION,
        kdf: {
            name: "PBKDF2",
            hash: "SHA-256",
            iterations: PBKDF2_ITERATIONS,
            salt: encodeBase64(salt),
        },
        encryption: {
            name: "AES-GCM",
            iv: "",
        },
        ciphertext: "",
    };
}

function envelopeAdditionalData(envelope: StoredCredentialVaultEnvelope): Uint8Array {
    return new TextEncoder().encode(
        JSON.stringify({
            version: envelope.version,
            kdf: envelope.kdf,
            encryption: envelope.encryption,
        }),
    );
}

function validateEnvelope(value: StoredCredentialVaultEnvelope): void {
    if (
        value.version !== VAULT_VERSION ||
        value.kdf.name !== "PBKDF2" ||
        value.kdf.hash !== "SHA-256" ||
        !Number.isSafeInteger(value.kdf.iterations) ||
        value.kdf.iterations < 100_000 ||
        value.kdf.iterations > 2_000_000 ||
        value.encryption.name !== "AES-GCM" ||
        value.kdf.salt === "" ||
        value.encryption.iv === "" ||
        value.ciphertext === ""
    ) {
        throw new CredentialVaultError("corrupted_record", "The stored credential vault is invalid.");
    }
}

function parseVaultPayload(value: string): VaultPayload {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.version !== VAULT_VERSION || !Array.isArray(parsed.credentials)) {
        throw new CredentialVaultError("corrupted_record", "The stored credential vault payload is invalid.");
    }

    const credentials = parsed.credentials.map((credential) => {
        if (
            !isRecord(credential) ||
            typeof credential.providerId !== "string" ||
            typeof credential.secret !== "string" ||
            typeof credential.updatedAt !== "string" ||
            (credential.label !== undefined && typeof credential.label !== "string")
        ) {
            throw new CredentialVaultError("corrupted_record", "The stored credential vault payload is invalid.");
        }
        return {
            providerId: credential.providerId,
            secret: credential.secret,
            updatedAt: credential.updatedAt,
            label: credential.label,
        };
    });

    if (new Set(credentials.map(({ providerId }) => providerId)).size !== credentials.length) {
        throw new CredentialVaultError("corrupted_record", "The stored credential vault payload is invalid.");
    }
    return { version: VAULT_VERSION, credentials };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
