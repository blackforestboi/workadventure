import { EncryptedCredentialVault } from "../CredentialVault";
import type { AssetGenerationProviderId } from "./AssetGenerationTypes";
import { createBrowserGenerationWorkerClient } from "./createBrowserGenerationWorkerClient";

let vault: EncryptedCredentialVault | undefined;
let worker: ReturnType<typeof createBrowserGenerationWorkerClient> | undefined;
let teardownInstalled = false;

function getVault(): EncryptedCredentialVault {
    vault ??= new EncryptedCredentialVault();
    return vault;
}

function getWorker(): ReturnType<typeof createBrowserGenerationWorkerClient> {
    worker ??= createBrowserGenerationWorkerClient();
    return worker;
}

export const assetGenerationSession = {
    get worker() {
        return getWorker();
    },
    get vault() {
        return getVault();
    },
    async connect(
        providerId: AssetGenerationProviderId,
        credential: string,
        persistence?: { passphrase: string; label?: string },
    ): Promise<void> {
        if (persistence !== undefined) {
            const credentialVault = getVault();
            try {
                if (!credentialVault.isUnlocked) await credentialVault.unlock(persistence.passphrase);
                await credentialVault.save(providerId, credential, persistence.label);
                await credentialVault.provisionSessionCredential(providerId, getWorker());
            } finally {
                // Once provisioned, the plaintext belongs only to the isolated
                // generation worker. Keep IndexedDB encrypted and the page's
                // main-thread vault locked between operations.
                credentialVault.lock();
            }
        } else {
            await getWorker().configureCredential(providerId, credential);
        }
    },
    async reconnectFromVault(providerId: AssetGenerationProviderId, passphrase: string): Promise<void> {
        const credentialVault = getVault();
        try {
            if (!credentialVault.isUnlocked) await credentialVault.unlock(passphrase);
            await credentialVault.provisionSessionCredential(providerId, getWorker());
        } finally {
            credentialVault.lock();
        }
    },
    lock(): void {
        vault?.lock();
        worker?.clearCredential().catch(() => undefined);
    },
};

if (typeof window !== "undefined" && !teardownInstalled) {
    teardownInstalled = true;
    window.addEventListener(
        "pagehide",
        () => {
            vault?.lock();
            worker?.dispose();
        },
        { once: true },
    );
}
