import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = createCrcTable();

export interface TestWokaPngOptions {
    width?: number;
    height?: number;
    transparent?: boolean;
    visible?: boolean;
    emptyFrame?: number;
}

export function createTestWokaPng(options: TestWokaPngOptions = {}): Buffer {
    const width = options.width ?? 96;
    const height = options.height ?? 128;
    const transparent = options.transparent ?? true;
    const visible = options.visible ?? true;
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;

    const rowBytes = width * 4;
    const frameWidth = width / 3;
    const frameHeight = height / 4;
    const raster = Buffer.alloc((rowBytes + 1) * height);
    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (rowBytes + 1);
        raster[rowOffset] = 0;
        for (let x = 0; x < width; x += 1) {
            const pixelOffset = rowOffset + 1 + x * 4;
            raster[pixelOffset] = 72;
            raster[pixelOffset + 1] = 123;
            raster[pixelOffset + 2] = 220;
            const frameIndex = Math.floor(y / frameHeight) * 3 + Math.floor(x / frameWidth);
            const frameVisible = visible && frameIndex !== options.emptyFrame;
            raster[pixelOffset + 3] = frameVisible ? (transparent && x === 0 && y === 0 ? 0 : 255) : 0;
        }
    }

    return concatBytes([
        PNG_SIGNATURE,
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raster)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

function chunk(type: string, data: Buffer): Buffer {
    const typeBytes = Buffer.from(type, "ascii");
    const result = Buffer.alloc(12 + data.length);
    result.writeUInt32BE(data.length, 0);
    typeBytes.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc32(concatBytes([typeBytes, data])), 8 + data.length);
    return result;
}

function concatBytes(parts: readonly Uint8Array[]): Buffer {
    const result = Buffer.alloc(parts.reduce((length, part) => length + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
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

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
