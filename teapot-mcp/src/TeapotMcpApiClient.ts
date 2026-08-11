import { asError } from "catch-unknown";

import type {
  TeapotMapPatch,
  TeapotMapSummary,
  TeapotMcpProposal,
  TeapotMcpProposalState,
  TeapotPaidGenerationRequest,
  TeapotPatchValidation,
} from "./contracts/index.js";

export interface TeapotMcpSessionContext {
  sessionId: string;
  ownerId: string;
  clientName: string;
  expiresAt: string;
}

export interface TeapotProposalStatus extends TeapotMcpProposal {
  approvalToken?: string;
}

export type TeapotTerrainType =
  | "earth"
  | "grass"
  | "sand"
  | "stone"
  | "path"
  | "water"
  | "snow"
  | "lava"
  | "void";

export interface TeapotTerrainAsset {
  id: string;
  tileId: number;
  name: string;
  description: string;
  terrainType: TeapotTerrainType;
  tags: readonly string[];
  solid: boolean;
  animated: boolean;
  family: string;
  atlasCoordinate: { column: number; row: number };
  searchText: string;
}

export interface TeapotTerrainCatalogResponse {
  version: string;
  tileset: {
    id: string;
    image: string;
    tileWidth: number;
    tileHeight: number;
  };
  total: number;
  available: number;
  items: readonly TeapotTerrainAsset[];
}

export type TeapotAtlasAssetKind =
  | "terrain"
  | "terrain-fragment"
  | "structure"
  | "prop"
  | "vegetation"
  | "decoration";

export type TeapotAtlasPlacement =
  | "terrain-tile"
  | "single-tile-object"
  | "multi-tile-fragment";

export interface TeapotAtlasAsset {
  id: string;
  tileId: number;
  name: string;
  description: string;
  kind: TeapotAtlasAssetKind;
  terrainType?: TeapotTerrainType;
  tags: readonly string[];
  solid: boolean;
  animated: boolean;
  family: string;
  placement: TeapotAtlasPlacement;
  editorEligible: boolean;
  atlasCoordinate: { column: number; row: number };
  searchText: string;
}

export interface TeapotAtlasAssetCatalogResponse {
  version: string;
  tileset: TeapotTerrainCatalogResponse["tileset"];
  total: number;
  available: number;
  terrainAvailable: number;
  items: readonly TeapotAtlasAsset[];
}

export interface TeapotMcpApiClientOptions {
  pusherUrl: string;
  bearerToken: string;
  fetch?: typeof fetch;
}

export class TeapotMcpApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TeapotMcpApiError";
  }
}

export class TeapotMcpApiClient {
  private readonly baseUrl: URL;
  private readonly request: typeof fetch;

  constructor(private readonly options: TeapotMcpApiClientOptions) {
    this.baseUrl = new URL(options.pusherUrl);
    this.request = options.fetch ?? fetch;
  }

  authenticate(signal?: AbortSignal): Promise<TeapotMcpSessionContext> {
    return this.fetchJson("teapot/mcp/session", { method: "GET", signal });
  }

  capabilities(signal?: AbortSignal): Promise<unknown> {
    return this.fetchJson("teapot/mcp/capabilities", { method: "GET", signal });
  }

  mapSummary(mapUrl: string, signal?: AbortSignal): Promise<TeapotMapSummary> {
    const path = `teapot/mcp/maps/summary?mapUrl=${encodeURIComponent(mapUrl)}`;
    return this.fetchJson(path, { method: "GET", signal });
  }

  terrainCatalog(
    input: {
      query?: string;
      terrainType?: TeapotTerrainType;
      solid?: boolean;
      limit?: number;
    } = {},
    signal?: AbortSignal,
  ): Promise<TeapotTerrainCatalogResponse> {
    const query = new URLSearchParams();
    if (input.query !== undefined) query.set("query", input.query);
    if (input.terrainType !== undefined)
      query.set("terrainType", input.terrainType);
    if (input.solid !== undefined) query.set("solid", String(input.solid));
    if (input.limit !== undefined) query.set("limit", String(input.limit));
    const suffix = query.size === 0 ? "" : `?${query.toString()}`;
    return this.fetchJson(`teapot/mcp/terrain-catalog${suffix}`, {
      method: "GET",
      signal,
    });
  }

  assetCatalog(
    input: {
      query?: string;
      kind?: TeapotAtlasAssetKind;
      terrainType?: TeapotTerrainType;
      solid?: boolean;
      limit?: number;
    } = {},
    signal?: AbortSignal,
  ): Promise<TeapotAtlasAssetCatalogResponse> {
    const query = new URLSearchParams();
    if (input.query !== undefined) query.set("query", input.query);
    if (input.kind !== undefined) query.set("kind", input.kind);
    if (input.terrainType !== undefined)
      query.set("terrainType", input.terrainType);
    if (input.solid !== undefined) query.set("solid", String(input.solid));
    if (input.limit !== undefined) query.set("limit", String(input.limit));
    const suffix = query.size === 0 ? "" : `?${query.toString()}`;
    return this.fetchJson(`teapot/mcp/asset-catalog${suffix}`, {
      method: "GET",
      signal,
    });
  }

  validatePatch(
    patch: TeapotMapPatch,
    signal?: AbortSignal,
  ): Promise<TeapotPatchValidation> {
    return this.fetchJson(
      "teapot/mcp/maps/validate",
      this.jsonRequest({ patch }, signal),
    );
  }

  createMapPatchProposal(
    patch: TeapotMapPatch,
    signal?: AbortSignal,
  ): Promise<TeapotMcpProposal> {
    return this.fetchJson(
      "teapot/mcp/proposals/map-patch",
      this.jsonRequest({ patch }, signal),
    );
  }

  createPaidGenerationProposal(
    request: TeapotPaidGenerationRequest,
    signal?: AbortSignal,
  ): Promise<TeapotMcpProposal> {
    return this.fetchJson(
      "teapot/mcp/proposals/paid-generation",
      this.jsonRequest({ request }, signal),
    );
  }

  createUndoProposal(
    input: {
      mapUrl: string;
      expectedRevision: number;
      previousRevisionUrl: string;
      title: string;
      rationale: string;
    },
    signal?: AbortSignal,
  ): Promise<TeapotMcpProposal> {
    return this.fetchJson(
      "teapot/mcp/proposals/undo",
      this.jsonRequest(input, signal),
    );
  }

  listProposals(
    state?: TeapotMcpProposalState,
    signal?: AbortSignal,
  ): Promise<TeapotMcpProposal[]> {
    const query =
      state === undefined ? "" : `?state=${encodeURIComponent(state)}`;
    return this.fetchJson(`teapot/mcp/proposals${query}`, {
      method: "GET",
      signal,
    });
  }

  getProposal(
    proposalId: string,
    signal?: AbortSignal,
  ): Promise<TeapotProposalStatus> {
    return this.fetchJson(
      `teapot/mcp/proposals/${encodeURIComponent(proposalId)}`,
      { method: "GET", signal },
    );
  }

  applyProposal(
    proposalId: string,
    approvalToken: string,
    signal?: AbortSignal,
  ): Promise<TeapotMcpProposal> {
    return this.fetchJson(
      `teapot/mcp/proposals/${encodeURIComponent(proposalId)}/apply`,
      this.jsonRequest({ approvalToken }, signal),
    );
  }

  private jsonRequest(body: unknown, signal?: AbortSignal): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    };
  }

  private async fetchJson<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.options.bearerToken}`);
    headers.set("Accept", "application/json");

    let response: Response;
    try {
      response = await this.request(new URL(path, this.baseUrl), {
        ...init,
        headers,
        cache: "no-store",
      });
    } catch (error: unknown) {
      throw new TeapotMcpApiError(
        "The Teapot authoring API is unavailable",
        503,
        {
          cause: asError(error),
        },
      );
    }
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => undefined);
      const message =
        readErrorMessage(body) ??
        `Teapot authoring API rejected the request (${response.status})`;
      throw new TeapotMcpApiError(message, response.status);
    }
    return response.json();
  }
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("error" in value))
    return undefined;
  const error = value.error;
  return typeof error === "string" ? error : undefined;
}
