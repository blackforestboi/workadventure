import * as z from "zod/v4";

import { TeapotMapPatch, TeapotPaidGenerationRequest } from "./domain.js";

export const TEAPOT_MCP_PROPOSAL_STATES = [
  "pending",
  "approved",
  "denied",
  "expired",
  "stale",
  "applied",
  "failed",
] as const;

export const TeapotMcpProposalState = z.enum(TEAPOT_MCP_PROPOSAL_STATES);
export type TeapotMcpProposalState = z.infer<typeof TeapotMcpProposalState>;

export const TeapotMcpProposalPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("map-patch"), patch: TeapotMapPatch }).strict(),
  z
    .object({
      kind: z.literal("paid-asset-generation"),
      request: TeapotPaidGenerationRequest,
    })
    .strict(),
  z
    .object({
      kind: z.literal("undo-map-publication"),
      mapUrl: z.string().url().max(2_048),
      expectedRevision: z.number().int().positive(),
      previousRevisionUrl: z.string().url().max(2_048),
      title: z.string().trim().min(1).max(120),
      rationale: z.string().trim().min(1).max(2_000),
    })
    .strict(),
]);

export type TeapotMcpProposalPayload = z.infer<typeof TeapotMcpProposalPayload>;

export const TeapotMcpProposal = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sessionId: z.string().uuid(),
    clientName: z.string().min(1).max(120),
    toolName: z.string().min(1).max(120),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(4_000),
    state: TeapotMcpProposalState,
    payload: TeapotMcpProposalPayload,
    patchDigest: z.string().regex(/^[a-f0-9]{64}$/),
    mapUrl: z.string().url().max(2_048).nullable(),
    expectedRevision: z.number().int().nonnegative().nullable(),
    estimatedCostUsd: z.number().finite().nonnegative().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    terminalMessage: z.string().max(1_000).nullable(),
    result: z.unknown().nullable(),
  })
  .strict();

export type TeapotMcpProposal = z.infer<typeof TeapotMcpProposal>;

export const TeapotMapSummary = z
  .object({
    mapUrl: z.string().url().max(2_048),
    revision: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tileWidth: z.number().int().positive(),
    tileHeight: z.number().int().positive(),
    tileLayers: z.array(
      z
        .object({
          name: z.string(),
          width: z.number().int(),
          height: z.number().int(),
        })
        .strict(),
    ),
    objectLayers: z.array(
      z
        .object({
          name: z.string(),
          objectCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    tilesets: z.array(
      z
        .object({
          name: z.string(),
          firstGid: z.number().int().positive(),
          lastGidExclusive: z.number().int().positive().nullable(),
          tileCount: z.number().int().positive().nullable(),
        })
        .strict(),
    ),
    objects: z
      .array(
        z
          .object({
            layer: z.string(),
            id: z.number().int().positive(),
            name: z.string(),
            type: z.string().nullable(),
            x: z.number(),
            y: z.number(),
            width: z.number().nullable(),
            height: z.number().nullable(),
          })
          .strict(),
      )
      .max(2_000),
  })
  .strict();

export type TeapotMapSummary = z.infer<typeof TeapotMapSummary>;

export const TeapotPatchValidation = z
  .object({
    valid: z.boolean(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    operationCount: z.number().int().nonnegative(),
    changedTileUpperBound: z.number().int().nonnegative(),
    importedTilesets: z.array(
      z
        .object({
          assetId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
          name: z.string().min(1).max(200),
          firstGid: z.number().int().positive().nullable(),
          lastGidExclusive: z.number().int().positive().nullable(),
          tileCount: z.number().int().positive().nullable(),
        })
        .strict(),
    ),
    warnings: z.array(z.string().max(500)).max(100),
    summary: z.string().max(4_000),
  })
  .strict();

export type TeapotPatchValidation = z.infer<typeof TeapotPatchValidation>;

export const TeapotMcpSessionCredential = z
  .object({
    sessionId: z.string().uuid(),
    bearerToken: z.string().min(32).max(512),
    clientName: z.string().min(1).max(120),
    expiresAt: z.string().datetime(),
    mcpEndpoint: z.string().url(),
  })
  .strict();

export type TeapotMcpSessionCredential = z.infer<
  typeof TeapotMcpSessionCredential
>;

export const TeapotPaidGenerationClaim = z
  .object({
    approvalId: z.string().uuid(),
  })
  .strict();

export type TeapotPaidGenerationClaim = z.infer<
  typeof TeapotPaidGenerationClaim
>;

export const TeapotPaidGenerationCompletionResult = z.discriminatedUnion(
  "status",
  [
    z
      .object({
        status: z.literal("accepted-asset"),
        assetId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
        assetUrl: z.string().url().max(2_048),
        assetKind: z.enum([
          "woka",
          "woka-part",
          "tileset",
          "map-entity",
          "reference",
        ]),
        providerId: z.enum(["openrouter", "codex-cli", "claude-cli"]),
        modelId: z.string().trim().min(1).max(300),
        mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        byteLength: z
          .number()
          .int()
          .positive()
          .max(32 * 1024 * 1024),
      })
      .strict(),
    z
      .object({
        status: z.literal("generation-failed"),
        reason: z.enum(["provider-error", "cancelled", "candidate-discarded"]),
      })
      .strict(),
  ],
);

export type TeapotPaidGenerationCompletionResult = z.infer<
  typeof TeapotPaidGenerationCompletionResult
>;
