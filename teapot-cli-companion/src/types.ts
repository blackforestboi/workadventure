export type CliProviderName = "codex" | "claude";

export type CliImageCapability = "available" | "unverified" | "unavailable";

export interface CliProviderCapability {
  provider: CliProviderName;
  installed: boolean;
  version?: string;
  imageGeneration: CliImageCapability;
  reason?: string;
}

export interface CliReferenceImage {
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}

export type CliAssetTarget =
  "woka-sheet" | "woka-layer" | "map-object" | "tileset";

export interface CliGenerateRequest {
  provider: CliProviderName;
  prompt: string;
  model?: string;
  target: CliAssetTarget;
  references?: CliReferenceImage[];
}

export interface CliGenerateResult {
  provider: CliProviderName;
  model?: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  provenance: {
    transport: "local-cli" | "hosted-codex-bridge" | "hosted-claude-bridge";
    executableVersion?: string;
  };
}

export interface CliProvider {
  capabilities(): Promise<CliProviderCapability>;
  generate(
    request: CliGenerateRequest,
    signal: AbortSignal,
  ): Promise<CliGenerateResult>;
}
