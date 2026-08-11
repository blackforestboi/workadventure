import { CredentialVaultError } from "./CredentialVaultError";
import type { EncryptedVaultStore, StoredCredentialVaultEnvelope } from "./CredentialVaultTypes";

const DATABASE_NAME = "teapot-credential-vault";
const OBJECT_STORE_NAME = "encrypted-vault";
const VAULT_RECORD_ID = "primary";

interface StoredVaultRecord {
    id: typeof VAULT_RECORD_ID;
    envelope: StoredCredentialVaultEnvelope;
}

export class IndexedDbEncryptedVaultStore implements EncryptedVaultStore {
    public constructor(
        private readonly indexedDb: IDBFactory = indexedDB,
        private readonly databaseName = DATABASE_NAME,
    ) {}

    public async load(): Promise<StoredCredentialVaultEnvelope | null> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readonly");
            const request: IDBRequest<unknown> = transaction.objectStore(OBJECT_STORE_NAME).get(VAULT_RECORD_ID);
            const value = await requestResult(request);
            if (value === undefined) return null;
            if (!isStoredVaultRecord(value)) {
                throw new CredentialVaultError("corrupted_record", "The stored credential vault is invalid.");
            }
            return value.envelope;
        } finally {
            database.close();
        }
    }

    public async save(envelope: StoredCredentialVaultEnvelope): Promise<void> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
            transaction
                .objectStore(OBJECT_STORE_NAME)
                .put({ id: VAULT_RECORD_ID, envelope } satisfies StoredVaultRecord);
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    public async delete(): Promise<void> {
        const database = await this.openDatabase();
        try {
            const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
            transaction.objectStore(OBJECT_STORE_NAME).delete(VAULT_RECORD_ID);
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    private openDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = this.indexedDb.open(this.databaseName, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                    request.result.createObjectStore(OBJECT_STORE_NAME, { keyPath: "id" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () =>
                reject(
                    new CredentialVaultError(
                        "persistence_error",
                        "The encrypted credential vault could not be opened.",
                        {
                            cause: request.error,
                        },
                    ),
                );
        });
    }
}

function requestResult(request: IDBRequest<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(
                new CredentialVaultError("persistence_error", "The encrypted credential vault could not be read.", {
                    cause: request.error,
                }),
            );
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(
                new CredentialVaultError("persistence_error", "The encrypted credential vault could not be updated.", {
                    cause: transaction.error,
                }),
            );
        transaction.onabort = () =>
            reject(
                new CredentialVaultError("persistence_error", "The encrypted credential vault update was aborted.", {
                    cause: transaction.error,
                }),
            );
    });
}

function isStoredVaultRecord(value: unknown): value is StoredVaultRecord {
    return isRecord(value) && value.id === VAULT_RECORD_ID && isRecord(value.envelope) && value.envelope.version === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
