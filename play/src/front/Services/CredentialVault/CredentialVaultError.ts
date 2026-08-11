import type { CredentialVaultErrorCode } from "./CredentialVaultTypes";

export class CredentialVaultError extends Error {
    public constructor(
        public readonly code: CredentialVaultErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = new.target.name;
    }
}
