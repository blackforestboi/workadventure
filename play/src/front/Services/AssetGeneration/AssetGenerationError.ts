import type {
    AssetGenerationErrorCode,
    AssetGenerationErrorPayload,
    AssetGenerationProviderId,
} from "./AssetGenerationTypes";

export class AssetGenerationError extends Error {
    public readonly code: AssetGenerationErrorCode;
    public readonly providerId?: AssetGenerationProviderId;
    public readonly httpStatus?: number;
    public readonly retryable: boolean;

    public constructor(
        code: AssetGenerationErrorCode,
        message: string,
        options: {
            providerId?: AssetGenerationProviderId;
            httpStatus?: number;
            retryable?: boolean;
            cause?: unknown;
        } = {},
    ) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = new.target.name;
        this.code = code;
        this.providerId = options.providerId;
        this.httpStatus = options.httpStatus;
        this.retryable = options.retryable ?? false;
    }

    public toPayload(): AssetGenerationErrorPayload {
        return {
            code: this.code,
            message: this.message,
            providerId: this.providerId,
            httpStatus: this.httpStatus,
            retryable: this.retryable,
        };
    }
}

export function createProviderHttpError(
    providerId: AssetGenerationProviderId,
    status: number,
    providerReason?: string,
): AssetGenerationError {
    if (status === 401 || status === 403) {
        const reason = redactProviderReason(providerReason);
        return new AssetGenerationError(
            "authentication_failed",
            `The provider rejected this credential.${reason === undefined ? "" : ` ${reason}`}`,
            {
                providerId,
                httpStatus: status,
            },
        );
    }

    if (status === 429) {
        return new AssetGenerationError("rate_limited", "The provider rate limit was reached. Try again later.", {
            providerId,
            httpStatus: status,
            retryable: true,
        });
    }

    if (status >= 400 && status < 500) {
        const reason = redactProviderReason(providerReason);
        return new AssetGenerationError(
            "provider_error",
            `The provider rejected this image request (HTTP ${status}).${reason === undefined ? "" : ` ${reason}`}`,
            { providerId, httpStatus: status },
        );
    }

    return new AssetGenerationError("provider_error", "The provider could not complete this generation request.", {
        providerId,
        httpStatus: status,
        retryable: status >= 500,
    });
}

function redactProviderReason(reason: string | undefined): string | undefined {
    if (reason === undefined) return undefined;
    const redacted = reason
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]")
        .trim();
    return redacted === "" ? undefined : redacted.slice(0, 240);
}

export function createCancelledGenerationError(providerId?: AssetGenerationProviderId): AssetGenerationError {
    return new AssetGenerationError("cancelled", "Generation was cancelled.", { providerId });
}

export function isAbortError(error: unknown): boolean {
    return error instanceof DOMException
        ? error.name === "AbortError"
        : error instanceof Error && error.name === "AbortError";
}

export function toRedactedGenerationError(
    error: unknown,
    providerId?: AssetGenerationProviderId,
): AssetGenerationError {
    if (error instanceof AssetGenerationError) {
        return error;
    }

    if (isAbortError(error)) {
        return createCancelledGenerationError(providerId);
    }

    return new AssetGenerationError("network_error", "The image provider could not be reached.", {
        providerId,
        retryable: true,
    });
}
