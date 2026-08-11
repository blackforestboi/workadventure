import type { TeapotWokaView } from "./TeapotWokaApi";
import { copyToArrayBuffer, decodeBase64, encodeBase64 } from "./AssetGeneration/Base64";

const STORAGE_KEY = "teapot-generated-wokas-v1";

interface LocallyStoredWoka {
    asset: TeapotWokaView;
    pngBase64: string;
}

export interface RememberedGeneratedWoka {
    asset: TeapotWokaView;
    png: Blob;
}

export async function rememberGeneratedWoka(asset: TeapotWokaView, png: Blob): Promise<void> {
    try {
        const stored = readStoredWokas().filter((candidate) => candidate.asset.id !== asset.id);
        const pngBase64 = encodeBase64(new Uint8Array(await png.arrayBuffer()));
        localStorage.setItem(STORAGE_KEY, JSON.stringify([{ asset, pngBase64 }, ...stored].slice(0, 24)));
    } catch {
        // The server catalog remains authoritative when browser storage is unavailable or full.
    }
}

export function forgetGeneratedWoka(textureId: string): void {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(readStoredWokas().filter((candidate) => candidate.asset.id !== textureId)),
        );
    } catch {
        // Deletion from the server remains authoritative.
    }
}

/**
 * Returns the local, full-resolution fallback for every accepted avatar.
 *
 * The server catalog is normally authoritative, but the development stack can
 * be restarted independently of the browser. Reading this backup lets the
 * avatar picker restore already-accepted work instead of silently losing it.
 */
export function loadRememberedGeneratedWokas(): RememberedGeneratedWoka[] {
    return readStoredWokas().flatMap((candidate) => {
        try {
            return [
                {
                    asset: candidate.asset,
                    png: new Blob([copyToArrayBuffer(decodeBase64(candidate.pngBase64))], { type: "image/png" }),
                },
            ];
        } catch {
            return [];
        }
    });
}

function readStoredWokas(): LocallyStoredWoka[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocallyStoredWoka);
}

function isLocallyStoredWoka(value: unknown): value is LocallyStoredWoka {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const candidate = value as Partial<LocallyStoredWoka>;
    return typeof candidate.pngBase64 === "string" && typeof candidate.asset?.id === "string";
}
