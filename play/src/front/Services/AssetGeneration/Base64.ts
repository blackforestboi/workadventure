const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(bytes: Uint8Array): string {
    let output = "";
    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index] ?? 0;
        const second = bytes[index + 1] ?? 0;
        const third = bytes[index + 2] ?? 0;
        const combined = (first << 16) | (second << 8) | third;

        output += BASE64_ALPHABET[(combined >> 18) & 63];
        output += BASE64_ALPHABET[(combined >> 12) & 63];
        output += index + 1 < bytes.length ? BASE64_ALPHABET[(combined >> 6) & 63] : "=";
        output += index + 2 < bytes.length ? BASE64_ALPHABET[combined & 63] : "=";
    }
    return output;
}

export function decodeBase64(value: string): Uint8Array {
    const normalized = value.replace(/\s/g, "");
    if (normalized.length === 0 || normalized.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(normalized)) {
        throw new Error("Invalid base64 data");
    }

    const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
    const output = new Uint8Array((normalized.length / 4) * 3 - padding);
    let outputIndex = 0;

    for (let index = 0; index < normalized.length; index += 4) {
        const first = BASE64_ALPHABET.indexOf(normalized[index]);
        const second = BASE64_ALPHABET.indexOf(normalized[index + 1]);
        const third = normalized[index + 2] === "=" ? 0 : BASE64_ALPHABET.indexOf(normalized[index + 2]);
        const fourth = normalized[index + 3] === "=" ? 0 : BASE64_ALPHABET.indexOf(normalized[index + 3]);
        if (first < 0 || second < 0 || third < 0 || fourth < 0) {
            throw new Error("Invalid base64 data");
        }

        const combined = (first << 18) | (second << 12) | (third << 6) | fourth;
        if (outputIndex < output.length) output[outputIndex++] = (combined >> 16) & 255;
        if (outputIndex < output.length) output[outputIndex++] = (combined >> 8) & 255;
        if (outputIndex < output.length) output[outputIndex++] = combined & 255;
    }

    return output;
}

export function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}
