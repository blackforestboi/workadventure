import { AssetGenerationError, createCancelledGenerationError } from "./AssetGenerationError";
import type { AssetGenerationReference, AssetGenerationReferenceRole } from "./AssetGenerationTypes";

const DEFAULT_MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REFERENCE_DIMENSION = 4096;
const DEFAULT_MAX_REFERENCE_COUNT = 8;
const ALLOWED_REFERENCE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

type ReferenceMimeType = (typeof ALLOWED_REFERENCE_MIME_TYPES)[number];

export interface ReencodedRaster {
    blob: Blob;
    width: number;
    height: number;
}

export interface RasterReferenceReencoder {
    reencode(blob: Blob, outputMimeType: ReferenceMimeType, signal: AbortSignal): Promise<ReencodedRaster>;
}

interface ReferenceImageNormalizerOptions {
    maximumInputBytes?: number;
    maximumDimension?: number;
    reencoder?: RasterReferenceReencoder;
}

export class ReferenceImageNormalizer {
    private readonly maximumInputBytes: number;
    private readonly maximumDimension: number;
    private readonly reencoder: RasterReferenceReencoder;

    public constructor(options: ReferenceImageNormalizerOptions = {}) {
        this.maximumInputBytes = options.maximumInputBytes ?? DEFAULT_MAX_REFERENCE_BYTES;
        this.maximumDimension = options.maximumDimension ?? DEFAULT_MAX_REFERENCE_DIMENSION;
        this.reencoder = options.reencoder ?? new BrowserRasterReferenceReencoder(this.maximumDimension);
    }

    public async normalize(
        id: string,
        source: Blob,
        signal: AbortSignal,
        role: AssetGenerationReferenceRole = "object-reference",
    ): Promise<AssetGenerationReference> {
        if (signal.aborted) throw createCancelledGenerationError();
        if (id.trim() === "") throw new AssetGenerationError("invalid_request", "A reference image ID is required.");
        if (source.size === 0 || source.size > this.maximumInputBytes) {
            throw new AssetGenerationError("invalid_request", "The reference image size is not supported.");
        }
        if (!isReferenceMimeType(source.type)) {
            throw new AssetGenerationError("invalid_request", "Reference images must be PNG, JPEG, or WebP.");
        }

        // Canvas decode + encode strips EXIF and other container metadata before provider transmission.
        let normalized: ReencodedRaster;
        try {
            normalized = await this.reencoder.reencode(source, source.type, signal);
        } catch (error: unknown) {
            if (error instanceof AssetGenerationError) throw error;
            if (signal.aborted) throw createCancelledGenerationError();
            throw new AssetGenerationError("invalid_request", "The reference image could not be decoded.");
        }
        if (signal.aborted) throw createCancelledGenerationError();
        if (
            normalized.width < 1 ||
            normalized.height < 1 ||
            normalized.width > this.maximumDimension ||
            normalized.height > this.maximumDimension ||
            normalized.blob.size === 0 ||
            normalized.blob.size > this.maximumInputBytes ||
            !isReferenceMimeType(normalized.blob.type)
        ) {
            throw new AssetGenerationError("invalid_request", "The normalized reference image is not supported.");
        }

        return {
            id,
            blob: normalized.blob,
            mimeType: normalized.blob.type,
            role,
        };
    }
}

export class BrowserRasterReferenceReencoder implements RasterReferenceReencoder {
    public constructor(private readonly maximumDimension = DEFAULT_MAX_REFERENCE_DIMENSION) {}

    public async reencode(
        blob: Blob,
        outputMimeType: ReferenceMimeType,
        signal: AbortSignal,
    ): Promise<ReencodedRaster> {
        if (signal.aborted) throw createCancelledGenerationError();
        const bitmap = await createImageBitmap(blob);
        try {
            if (signal.aborted) throw createCancelledGenerationError();
            const scale = Math.min(1, this.maximumDimension / Math.max(bitmap.width, bitmap.height));
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));
            const normalizedBlob = await renderBitmap(bitmap, width, height, outputMimeType);
            if (signal.aborted) throw createCancelledGenerationError();
            return { blob: normalizedBlob, width, height };
        } finally {
            bitmap.close();
        }
    }
}

export interface EphemeralReference {
    id: string;
    blob: Blob;
    mimeType: ReferenceMimeType;
    objectUrl: string;
    role: AssetGenerationReferenceRole;
}

interface ObjectUrlAdapter {
    create(blob: Blob): string;
    revoke(url: string): void;
}

interface EphemeralReferenceCollectionOptions {
    normalizer?: ReferenceImageNormalizer;
    maximumCount?: number;
    createId?: () => string;
    objectUrls?: ObjectUrlAdapter;
}

export class EphemeralReferenceCollection {
    private readonly references = new Map<string, EphemeralReference>();
    private readonly normalizer: ReferenceImageNormalizer;
    private readonly maximumCount: number;
    private readonly createId: () => string;
    private readonly objectUrls: ObjectUrlAdapter;
    private disposed = false;

    public constructor(options: EphemeralReferenceCollectionOptions = {}) {
        this.normalizer = options.normalizer ?? new ReferenceImageNormalizer();
        this.maximumCount = options.maximumCount ?? DEFAULT_MAX_REFERENCE_COUNT;
        this.createId = options.createId ?? (() => crypto.randomUUID());
        this.objectUrls = options.objectUrls ?? {
            create: (blob) => URL.createObjectURL(blob),
            revoke: (url) => URL.revokeObjectURL(url),
        };
    }

    public async add(
        source: Blob,
        signal: AbortSignal,
        role: AssetGenerationReferenceRole = "object-reference",
    ): Promise<EphemeralReference> {
        this.assertActive();
        if (this.references.size >= this.maximumCount) {
            throw new AssetGenerationError("invalid_request", "Too many reference images are attached.");
        }

        const normalized = await this.normalizer.normalize(this.createId(), source, signal, role);
        this.assertActive();
        const reference: EphemeralReference = {
            ...normalized,
            objectUrl: this.objectUrls.create(normalized.blob),
        };
        this.references.set(reference.id, reference);
        return reference;
    }

    public list(): readonly EphemeralReference[] {
        this.assertActive();
        return [...this.references.values()];
    }

    public forGeneration(): readonly AssetGenerationReference[] {
        this.assertActive();
        return [...this.references.values()].map(({ id, blob, mimeType, role }) => ({ id, blob, mimeType, role }));
    }

    public setRole(id: string, role: AssetGenerationReferenceRole): void {
        this.assertActive();
        const reference = this.references.get(id);
        if (reference !== undefined) reference.role = role;
    }

    public remove(id: string): void {
        const reference = this.references.get(id);
        if (reference === undefined) return;
        this.objectUrls.revoke(reference.objectUrl);
        this.references.delete(id);
    }

    public clear(): void {
        for (const reference of this.references.values()) {
            this.objectUrls.revoke(reference.objectUrl);
        }
        this.references.clear();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.clear();
        this.disposed = true;
    }

    private assertActive(): void {
        if (this.disposed) {
            throw new AssetGenerationError("invalid_request", "This reference image session is closed.");
        }
    }
}

function isReferenceMimeType(value: string): value is ReferenceMimeType {
    return ALLOWED_REFERENCE_MIME_TYPES.some((mimeType) => mimeType === value);
}

async function renderBitmap(
    bitmap: ImageBitmap,
    width: number,
    height: number,
    outputMimeType: ReferenceMimeType,
): Promise<Blob> {
    if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (context === null) throw new AssetGenerationError("invalid_request", "The image could not be decoded.");
        context.drawImage(bitmap, 0, 0, width, height);
        return canvas.convertToBlob({ type: outputMimeType, quality: 0.92 });
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new AssetGenerationError("invalid_request", "The image could not be decoded.");
    context.drawImage(bitmap, 0, 0, width, height);

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (normalizedBlob) => {
                if (normalizedBlob === null) {
                    reject(new AssetGenerationError("invalid_request", "The image could not be re-encoded."));
                    return;
                }
                resolve(normalizedBlob);
            },
            outputMimeType,
            0.92,
        );
    });
}
