import { createHash } from "node:crypto";

import { TeapotWokaValidationError } from "./TeapotWokaPngValidator";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const TILE_SIZE = 32;
const CRC_TABLE = createCrcTable();

export interface ValidatedTeapotTilesetPng {
    bytes: Buffer;
    sha256: string;
    width: number;
    height: number;
    columns: number;
    rows: number;
}

/** Verifies an immutable browser-normalized PNG before it is exposed by the public raster route. */
export function validateTeapotTilesetPng(input: Buffer): ValidatedTeapotTilesetPng {
    if (input.length === 0 || input.length > MAX_FILE_BYTES) {
        throw new TeapotWokaValidationError(`Tileset PNG must be between 1 byte and ${MAX_FILE_BYTES} bytes`);
    }
    if (input.length < 33 || !input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new TeapotWokaValidationError("Tileset asset must be a PNG image");
    }
    let offset = PNG_SIGNATURE.length;
    let width = 0;
    let height = 0;
    let sawHeader = false;
    let sawImageData = false;
    let sawEnd = false;
    let chunkIndex = 0;
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
        if (!/^[A-Za-z]{4}$/.test(type)) throw new TeapotWokaValidationError("PNG has an invalid chunk type");
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
            const compression = data[10];
            const filter = data[11];
            const interlace = data[12];
            if (width !== TILE_SIZE || height !== TILE_SIZE) {
                throw new TeapotWokaValidationError("Terrain assets must contain exactly one 32×32px tile");
            }
            if (compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) {
                throw new TeapotWokaValidationError("Tileset PNG uses unsupported encoding settings");
            }
            sawHeader = true;
        } else if (type === "IDAT") {
            if (!sawHeader) throw new TeapotWokaValidationError("PNG image data must follow IHDR");
            sawImageData = true;
        } else if (type === "IEND") {
            if (!sawImageData || length !== 0 || sawEnd) throw new TeapotWokaValidationError("PNG has an invalid IEND");
            sawEnd = true;
            if (nextOffset !== input.length) throw new TeapotWokaValidationError("PNG contains bytes after IEND");
        }
        offset = nextOffset;
        chunkIndex += 1;
    }
    if (!sawHeader || !sawImageData || !sawEnd) throw new TeapotWokaValidationError("PNG is incomplete");
    return {
        bytes: Buffer.from(input),
        sha256: createHash("sha256").update(input).digest("hex"),
        width,
        height,
        columns: width / TILE_SIZE,
        rows: height / TILE_SIZE,
    };
}

function createCrcTable(): Uint32Array {
    const table = new Uint32Array(256);
    for (let index = 0; index < table.length; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        table[index] = value >>> 0;
    }
    return table;
}

function crc32(bytes: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
