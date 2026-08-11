import { readFile } from "node:fs/promises";
import { CompanionRequestError } from "./security.js";

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

export async function readValidatedImage(path: string): Promise<{
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}> {
  const bytes = await readFile(path);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_OUTPUT_BYTES) {
    throw new CompanionRequestError(
      "CLI image output has an invalid size",
      502,
    );
  }
  let mimeType: "image/png" | "image/jpeg" | "image/webp" | undefined;
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    mimeType = "image/png";
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mimeType = "image/jpeg";
  } else if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    mimeType = "image/webp";
  }
  if (!mimeType) {
    throw new CompanionRequestError(
      "CLI returned an unsupported image format",
      502,
    );
  }
  return { mimeType, base64: bytes.toString("base64") };
}
