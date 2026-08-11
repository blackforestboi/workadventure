import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import { asError } from "catch-unknown";

import { TEAPOT_WOKA_SPRITE_SHEET } from "../../common/Teapot/TeapotWoka";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FRAME_COLUMNS = TEAPOT_WOKA_SPRITE_SHEET.frameColumns;
const FRAME_ROWS = TEAPOT_WOKA_SPRITE_SHEET.frameRows;
const BYTES_PER_PIXEL = 4;
const MAX_FRAME_SIZE = 1024;
export const MAX_WOKA_FILE_BYTES = 32 * 1024 * 1024;
const CRC_TABLE = createCrcTable();

export interface ValidatedTeapotWokaPng {
    bytes: Buffer;
    sha256: string;
    width: number;
    height: number;
    frameWidth: number;
    frameHeight: number;
    frameColumns: typeof FRAME_COLUMNS;
    frameRows: typeof FRAME_ROWS;
}

export class TeapotWokaValidationError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

/**
 * Validates the complete PNG structure and decoded raster without accepting alternate PNG encodings.
 *
 * WorkAdventure has no server-side image codec dependency today, so generated Wokas are deliberately restricted to
 * non-interlaced, 8-bit RGBA PNGs instead of being re-encoded. This keeps the storage boundary deterministic while
 * still verifying chunk CRCs, decompression bounds, the 3x4 frame layout, visible pixels, and real transparency.
 */
export function validateTeapotWokaPng(input: Buffer): ValidatedTeapotWokaPng {
    if (input.length === 0 || input.length > MAX_WOKA_FILE_BYTES) {
        throw new TeapotWokaValidationError(`Woka PNG must be between 1 byte and ${MAX_WOKA_FILE_BYTES} bytes`);
    }
    if (input.length < PNG_SIGNATURE.length || !input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new TeapotWokaValidationError("Woka asset must be a PNG image");
    }

    const idatChunks: Buffer[] = [];
    let offset = PNG_SIGNATURE.length;
    let chunkIndex = 0;
    let sawHeader = false;
    let sawPalette = false;
    let sawImageData = false;
    let imageDataEnded = false;
    let sawEnd = false;
    let dimensions: WokaDimensions | undefined;

    while (offset < input.length) {
        if (offset + 12 > input.length) {
            throw new TeapotWokaValidationError("PNG contains a truncated chunk");
        }
        const length = input.readUInt32BE(offset);
        const typeOffset = offset + 4;
        const dataOffset = typeOffset + 4;
        const crcOffset = dataOffset + length;
        const nextOffset = crcOffset + 4;
        if (nextOffset > input.length) {
            throw new TeapotWokaValidationError("PNG chunk length exceeds the uploaded file");
        }

        const typeBytes = input.subarray(typeOffset, dataOffset);
        const type = typeBytes.toString("ascii");
        if (!/^[A-Za-z]{4}$/.test(type)) {
            throw new TeapotWokaValidationError("PNG contains an invalid chunk type");
        }
        if ((type.charCodeAt(2) & 0x20) !== 0) {
            throw new TeapotWokaValidationError("PNG chunk type uses the reserved lowercase bit");
        }
        const data = input.subarray(dataOffset, crcOffset);
        const expectedCrc = input.readUInt32BE(crcOffset);
        const actualCrc = crc32(Buffer.concat([typeBytes, data]));
        if (actualCrc !== expectedCrc) {
            throw new TeapotWokaValidationError(`PNG ${type} chunk has an invalid checksum`);
        }

        if (type === "IHDR") {
            if (chunkIndex !== 0 || sawHeader || length !== 13) {
                throw new TeapotWokaValidationError("PNG must start with exactly one valid IHDR chunk");
            }
            dimensions = validateHeader(data);
            sawHeader = true;
        } else if (type === "IDAT") {
            if (!sawHeader || imageDataEnded) {
                throw new TeapotWokaValidationError("PNG IDAT chunks must be contiguous and follow IHDR");
            }
            sawImageData = true;
            idatChunks.push(data);
        } else if (type === "IEND") {
            if (!sawHeader || !sawImageData || length !== 0 || sawEnd) {
                throw new TeapotWokaValidationError("PNG contains an invalid IEND chunk");
            }
            sawEnd = true;
            offset = nextOffset;
            if (offset !== input.length) {
                throw new TeapotWokaValidationError("PNG contains bytes after IEND");
            }
            break;
        } else {
            if (sawImageData) imageDataEnded = true;
            if (isCriticalChunk(type)) {
                if (type !== "PLTE" || sawImageData) {
                    throw new TeapotWokaValidationError(`PNG contains unsupported critical chunk ${type}`);
                }
                if (sawPalette || length === 0 || length % 3 !== 0 || length > 768) {
                    throw new TeapotWokaValidationError("PNG contains an invalid PLTE chunk");
                }
                sawPalette = true;
            }
        }

        offset = nextOffset;
        chunkIndex += 1;
    }

    if (!sawEnd) {
        throw new TeapotWokaValidationError("PNG is missing its IEND chunk");
    }

    if (dimensions === undefined) throw new TeapotWokaValidationError("PNG is missing its IHDR chunk");
    const decoded = inflateImageData(idatChunks, dimensions);
    validatePixels(decoded, dimensions);

    return {
        bytes: Buffer.from(input),
        sha256: createHash("sha256").update(input).digest("hex"),
        width: dimensions.width,
        height: dimensions.height,
        frameWidth: dimensions.frameWidth,
        frameHeight: dimensions.frameHeight,
        frameColumns: FRAME_COLUMNS,
        frameRows: FRAME_ROWS,
    };
}

interface WokaDimensions {
    width: number;
    height: number;
    frameWidth: number;
    frameHeight: number;
    scanlineBytes: number;
    inflatedBytes: number;
}

function validateHeader(data: Buffer): WokaDimensions {
    const width = data.readUInt32BE(0);
    const height = data.readUInt32BE(4);
    const bitDepth = data[8];
    const colorType = data[9];
    const compression = data[10];
    const filter = data[11];
    const interlace = data[12];
    if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new TeapotWokaValidationError("Woka PNG must be a non-interlaced, 8-bit RGBA image");
    }
    if (width % FRAME_COLUMNS !== 0 || height % FRAME_ROWS !== 0) {
        throw new TeapotWokaValidationError("Woka sprite sheet must contain an exact 3x4 frame grid");
    }
    const frameWidth = width / FRAME_COLUMNS;
    const frameHeight = height / FRAME_ROWS;
    if (frameWidth !== frameHeight || frameWidth < 1 || frameWidth > MAX_FRAME_SIZE) {
        throw new TeapotWokaValidationError(
            `Woka animation frames must be square and no larger than ${MAX_FRAME_SIZE}x${MAX_FRAME_SIZE} pixels`,
        );
    }
    const scanlineBytes = width * BYTES_PER_PIXEL;
    return {
        width,
        height,
        frameWidth,
        frameHeight,
        scanlineBytes,
        inflatedBytes: (scanlineBytes + 1) * height,
    };
}

function inflateImageData(chunks: Buffer[], dimensions: WokaDimensions): Buffer {
    try {
        const decoded = inflateSync(Buffer.concat(chunks), { maxOutputLength: dimensions.inflatedBytes });
        if (decoded.length !== dimensions.inflatedBytes) {
            throw new TeapotWokaValidationError("PNG decoded raster has an unexpected size");
        }
        return decoded;
    } catch (error: unknown) {
        if (error instanceof TeapotWokaValidationError) throw error;
        throw new TeapotWokaValidationError("PNG image data could not be decoded", { cause: asError(error) });
    }
}

function validatePixels(decoded: Buffer, dimensions: WokaDimensions): void {
    let sourceOffset = 0;
    let previous = Buffer.alloc(dimensions.scanlineBytes);
    let hasTransparentPixel = false;
    let hasVisiblePixel = false;
    const visibleFrames = Array.from({ length: FRAME_COLUMNS * FRAME_ROWS }, () => false);

    for (let y = 0; y < dimensions.height; y += 1) {
        const filter = decoded[sourceOffset];
        sourceOffset += 1;
        if (filter === undefined || filter > 4) {
            throw new TeapotWokaValidationError("PNG uses an invalid scanline filter");
        }
        const current = Buffer.allocUnsafe(dimensions.scanlineBytes);
        for (let index = 0; index < dimensions.scanlineBytes; index += 1) {
            const encoded = decoded[sourceOffset + index];
            if (encoded === undefined) {
                throw new TeapotWokaValidationError("PNG decoded raster is truncated");
            }
            const left = index >= BYTES_PER_PIXEL ? (current[index - BYTES_PER_PIXEL] ?? 0) : 0;
            const up = previous[index] ?? 0;
            const upLeft = index >= BYTES_PER_PIXEL ? (previous[index - BYTES_PER_PIXEL] ?? 0) : 0;
            current[index] = (encoded + filterPredictor(filter, left, up, upLeft)) & 0xff;
        }
        sourceOffset += dimensions.scanlineBytes;
        for (let alphaIndex = 3; alphaIndex < current.length; alphaIndex += BYTES_PER_PIXEL) {
            const alpha = current[alphaIndex] ?? 0;
            if (alpha < 255) hasTransparentPixel = true;
            if (alpha > 0) {
                hasVisiblePixel = true;
                const x = (alphaIndex - 3) / BYTES_PER_PIXEL;
                const frameIndex =
                    Math.floor(y / dimensions.frameHeight) * FRAME_COLUMNS + Math.floor(x / dimensions.frameWidth);
                visibleFrames[frameIndex] = true;
            }
        }
        previous = current;
    }

    if (!hasTransparentPixel) {
        throw new TeapotWokaValidationError("Woka PNG must contain transparent pixels");
    }
    if (!hasVisiblePixel) {
        throw new TeapotWokaValidationError("Woka PNG cannot be fully transparent");
    }
    if (visibleFrames.some((visible) => !visible)) {
        throw new TeapotWokaValidationError("Each of the 12 Woka animation frames must contain visible pixels");
    }
}

function filterPredictor(filter: number, left: number, up: number, upLeft: number): number {
    switch (filter) {
        case 0:
            return 0;
        case 1:
            return left;
        case 2:
            return up;
        case 3:
            return Math.floor((left + up) / 2);
        case 4:
            return paeth(left, up, upLeft);
        default:
            throw new TeapotWokaValidationError(`Unsupported PNG filter ${filter}`);
    }
}

function paeth(left: number, up: number, upLeft: number): number {
    const estimate = left + up - upLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const upLeftDistance = Math.abs(estimate - upLeft);
    if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
    if (upDistance <= upLeftDistance) return up;
    return upLeft;
}

function isCriticalChunk(type: string): boolean {
    const firstByte = type.charCodeAt(0);
    return (firstByte & 0x20) === 0;
}

function createCrcTable(): Uint32Array {
    const table = new Uint32Array(256);
    for (let index = 0; index < table.length; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
}

function crc32(bytes: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
