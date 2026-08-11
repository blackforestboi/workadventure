import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import { asError } from "catch-unknown";

import { TeapotWokaValidationError } from "./TeapotWokaPngValidator";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 4_096;
const BYTES_PER_PIXEL = 4;
const CRC_TABLE = createCrcTable();

export interface ValidatedTeapotGeneratedPng {
    bytes: Buffer;
    sha256: string;
    width: number;
    height: number;
}

/** Validates browser-normalized, non-interlaced 8-bit RGBA PNGs before durable publication. */
export function validateTeapotGeneratedPng(input: Buffer): ValidatedTeapotGeneratedPng {
    if (input.length === 0 || input.length > MAX_FILE_BYTES) {
        throw new TeapotWokaValidationError(`Generated PNG must be between 1 byte and ${MAX_FILE_BYTES} bytes`);
    }
    if (input.length < 33 || !input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new TeapotWokaValidationError("Generated asset must be a PNG image");
    }

    const idatChunks: Buffer[] = [];
    let width = 0;
    let height = 0;
    let offset = PNG_SIGNATURE.length;
    let chunkIndex = 0;
    let sawHeader = false;
    let sawImageData = false;
    let imageDataEnded = false;
    let sawEnd = false;

    while (offset < input.length) {
        if (offset + 12 > input.length) throw new TeapotWokaValidationError("PNG contains a truncated chunk");
        const length = input.readUInt32BE(offset);
        const typeOffset = offset + 4;
        const dataOffset = typeOffset + 4;
        const crcOffset = dataOffset + length;
        const nextOffset = crcOffset + 4;
        if (nextOffset > input.length) throw new TeapotWokaValidationError("PNG chunk length exceeds the upload");
        const typeBytes = input.subarray(typeOffset, dataOffset);
        const type = typeBytes.toString("ascii");
        if (!/^[A-Za-z]{4}$/.test(type) || (type.charCodeAt(2) & 0x20) !== 0) {
            throw new TeapotWokaValidationError("PNG has an invalid chunk type");
        }
        const data = input.subarray(dataOffset, crcOffset);
        if (crc32(Buffer.concat([typeBytes, data])) !== input.readUInt32BE(crcOffset)) {
            throw new TeapotWokaValidationError(`PNG ${type} chunk has an invalid checksum`);
        }

        if (type === "IHDR") {
            if (chunkIndex !== 0 || sawHeader || length !== 13) {
                throw new TeapotWokaValidationError("PNG must start with exactly one IHDR chunk");
            }
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
                throw new TeapotWokaValidationError(`Generated dimensions must be between 1 and ${MAX_DIMENSION}px`);
            }
            if (data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
                throw new TeapotWokaValidationError("Generated PNG must be non-interlaced, 8-bit RGBA");
            }
            sawHeader = true;
        } else if (type === "IDAT") {
            if (!sawHeader || imageDataEnded) {
                throw new TeapotWokaValidationError("PNG IDAT chunks must be contiguous and follow IHDR");
            }
            sawImageData = true;
            idatChunks.push(data);
        } else if (type === "IEND") {
            if (!sawImageData || length !== 0 || sawEnd || nextOffset !== input.length) {
                throw new TeapotWokaValidationError("PNG has an invalid IEND chunk");
            }
            sawEnd = true;
        } else {
            if (sawImageData) imageDataEnded = true;
            if ((type.charCodeAt(0) & 0x20) === 0) {
                throw new TeapotWokaValidationError(`PNG contains unsupported critical chunk ${type}`);
            }
        }
        offset = nextOffset;
        chunkIndex += 1;
    }
    if (!sawHeader || !sawImageData || !sawEnd) throw new TeapotWokaValidationError("PNG is incomplete");

    const rowBytes = width * BYTES_PER_PIXEL;
    const expectedDecodedBytes = (rowBytes + 1) * height;
    try {
        const decoded = inflateSync(Buffer.concat(idatChunks), { maxOutputLength: expectedDecodedBytes });
        if (decoded.length !== expectedDecodedBytes) throw new Error("unexpected decoded length");
        for (let row = 0; row < height; row += 1) {
            const filter = decoded[row * (rowBytes + 1)];
            if (filter === undefined || filter > 4) throw new Error("invalid scanline filter");
        }
    } catch (error: unknown) {
        throw new TeapotWokaValidationError("PNG image data could not be decoded", { cause: asError(error) });
    }

    return {
        bytes: Buffer.from(input),
        sha256: createHash("sha256").update(input).digest("hex"),
        width,
        height,
    };
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
    for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
