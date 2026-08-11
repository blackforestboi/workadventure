import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  TEAPOT_AUTHORING_VOCABULARY,
  TEAPOT_MCP_PROPOSAL_STATES,
  TeapotMapPatch,
  TeapotPaidGenerationRequest,
  validateTeapotPatchContract,
} from "./contracts/index.js";
import type { TeapotMcpApiClient } from "./TeapotMcpApiClient.js";

const ProposalIdInput = z.object({ proposalId: z.string().uuid() }).strict();

export function createTeapotMcpServer(api: TeapotMcpApiClient): McpServer {
  const server = new McpServer(
    { name: "teapot-maps-authoring", version: "1.0.0" },
    {
      capabilities: { tools: { listChanged: false } },
      instructions: [
        "Use teapot_read_capabilities and teapot_read_map_summary before designing changes.",
        "Use only the structured Teapot patch vocabulary. Never submit raw TMJ, WAM, scripts, shell, HTML, or arbitrary property bags.",
        "Validate and draft before proposing. A proposal never mutates the world.",
        "Map mutations and paid image generation require the player to approve the browser proposal.",
        "For map patches and undo, read the approved proposal to receive its short-lived one-time token, then call teapot_apply_approved_proposal.",
        "Paid generation is claimed, executed once, previewed, and completed entirely by the player's browser; poll its proposal state and never try to apply it from MCP.",
        "A stale map revision requires a new summary, validation, and proposal.",
      ].join(" "),
    },
  );

  server.registerTool(
    "teapot_read_capabilities",
    {
      title: "Read Teapot authoring capabilities",
      description:
        "Returns the complete structured vocabulary for map elements, interaction properties, animations, avatar and asset formats, limits, and the approval workflow. Call this before drafting any Teapot change.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => toolResult(await api.capabilities()),
  );

  server.registerTool(
    "teapot_read_map_summary",
    {
      title: "Read an editable map summary",
      description:
        "Returns the current monotonic revision, dimensions, layer names, embedded tileset GID ranges, and a bounded object index. It deliberately does not return raw TMJ or WAM.",
      inputSchema: z.object({ mapUrl: z.string().url().max(2_048) }).strict(),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mapUrl }) => toolResult(await api.mapSummary(mapUrl)),
  );

  server.registerTool(
    "teapot_search_terrain_assets",
    {
      title: "Search curated terrain assets",
      description:
        "Returns only curated background terrain cells from the built-in LPC outdoor atlas. Every result includes a stable ID, local tile ID, terrain type, rich LLM-searchable description and tags, collision intent through solid, animation status, and atlas coordinate. Furniture, walls, bridges, crops, stairs, and other objects are intentionally excluded.",
      inputSchema: z
        .object({
          query: z.string().trim().min(1).max(200).optional(),
          terrainType: z
            .enum([
              "earth",
              "grass",
              "sand",
              "stone",
              "path",
              "water",
              "snow",
              "lava",
              "void",
            ])
            .optional(),
          solid: z.boolean().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => toolResult(await api.terrainCatalog(input)),
  );

  server.registerTool(
    "teapot_search_map_assets",
    {
      title: "Search all classified built-in map assets",
      description:
        "Searches every non-empty cell in the built-in LPC outdoor atlas, including terrain, structures, props, vegetation, and decoration. Each result has a stable ID, rich search description and tags, kind, placement guidance, default collision intent, and whether it is safe for the terrain editor. Use this before proposing a map so a bridge, wall, crop, or prop is not mistaken for a floor tile.",
      inputSchema: z
        .object({
          query: z.string().trim().min(1).max(200).optional(),
          kind: z
            .enum([
              "terrain",
              "terrain-fragment",
              "structure",
              "prop",
              "vegetation",
              "decoration",
            ])
            .optional(),
          terrainType: z
            .enum([
              "earth",
              "grass",
              "sand",
              "stone",
              "path",
              "water",
              "snow",
              "lava",
              "void",
            ])
            .optional(),
          solid: z.boolean().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => toolResult(await api.assetCatalog(input)),
  );

  server.registerTool(
    "teapot_list_map_elements",
    {
      title: "List map layers, tilesets, or placed objects",
      description:
        "Lists a bounded, semantic subset of the current map for planning: tile layers, object layers, embedded tileset GID ranges, or placed objects. Optional layer and object-type filters reduce the result. Raw TMJ and WAM are never returned.",
      inputSchema: z
        .object({
          mapUrl: z.string().url().max(2_048),
          category: z.enum([
            "tile-layers",
            "object-layers",
            "tilesets",
            "objects",
          ]),
          layer: z.string().trim().min(1).max(200).optional(),
          objectType: z.string().trim().min(1).max(200).optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mapUrl, category, layer, objectType }) => {
      const summary = await api.mapSummary(mapUrl);
      switch (category) {
        case "tile-layers":
          return toolResult(
            summary.tileLayers.filter(
              (candidate) => layer === undefined || candidate.name === layer,
            ),
          );
        case "object-layers":
          return toolResult(
            summary.objectLayers.filter(
              (candidate) => layer === undefined || candidate.name === layer,
            ),
          );
        case "tilesets":
          return toolResult(summary.tilesets);
        case "objects":
          return toolResult(
            summary.objects.filter(
              (candidate) =>
                (layer === undefined || candidate.layer === layer) &&
                (objectType === undefined || candidate.type === objectType),
            ),
          );
        default: {
          const exhaustive: never = category;
          throw new Error(
            `Unsupported map element category: ${String(exhaustive)}`,
          );
        }
      }
    },
  );

  server.registerTool(
    "teapot_validate_map_patch",
    {
      title: "Validate a structured map patch",
      description:
        "Checks the strict no-raw-format patch contract and validates referenced layers, object IDs, GIDs, coordinates, animations, properties, and expected revision against the current map. Does not create a proposal or mutate anything.",
      inputSchema: TeapotMapPatch,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (patch) => toolResult(await api.validatePatch(patch)),
  );

  server.registerTool(
    "teapot_draft_map_patch",
    {
      title: "Draft a review summary for a structured map patch",
      description:
        "Normalizes a valid structured patch into its stable SHA-256 digest, operation counts, warnings, and human review summary. This is local and creates no server record.",
      inputSchema: TeapotMapPatch,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (patch) => toolResult(validateTeapotPatchContract(patch)),
  );

  server.registerTool(
    "teapot_propose_map_patch",
    {
      title: "Propose a map patch for browser approval",
      description:
        "Creates a persistent, owner- and MCP-session-scoped browser proposal after strict server validation. It never applies the patch. The player must inspect and approve it in Teapot Maps.",
      inputSchema: TeapotMapPatch,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (patch) => toolResult(await api.createMapPatchProposal(patch)),
  );

  server.registerTool(
    "teapot_propose_paid_generation",
    {
      title: "Propose a paid asset-generation call",
      description:
        "Creates a persistent browser proposal describing an avatar, component, map entity, or tileset image generation. The tool never contacts a model provider and never receives user provider keys; the browser owns approval and execution with the player's configured provider.",
      inputSchema: TeapotPaidGenerationRequest,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (request) =>
      toolResult(await api.createPaidGenerationProposal(request)),
  );

  server.registerTool(
    "teapot_propose_undo",
    {
      title: "Propose restoring a previous map publication",
      description:
        "Creates a browser-visible proposal to restore a specific immutable previous-revision snapshot. It does not restore anything until explicitly approved and applied at the expected current revision.",
      inputSchema: z
        .object({
          mapUrl: z.string().url().max(2_048),
          expectedRevision: z.number().int().positive(),
          previousRevisionUrl: z.string().url().max(2_048),
          title: z.string().trim().min(1).max(120),
          rationale: z.string().trim().min(1).max(2_000),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => toolResult(await api.createUndoProposal(input)),
  );

  server.registerTool(
    "teapot_list_proposals",
    {
      title: "List proposals from this MCP session",
      description:
        "Lists persistent proposals belonging to the authenticated player and this exact MCP session, optionally filtered by lifecycle state.",
      inputSchema: z
        .object({ state: z.enum(TEAPOT_MCP_PROPOSAL_STATES).optional() })
        .strict(),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ state }) => toolResult(await api.listProposals(state)),
  );

  server.registerTool(
    "teapot_get_proposal",
    {
      title: "Read one proposal and its approval state",
      description:
        "Returns a proposal's current pending, approved, denied, expired, stale, applied, or failed state. For an approved proposal, this returns the short-lived one-time token only to its bound MCP session.",
      inputSchema: ProposalIdInput,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ proposalId }) => toolResult(await api.getProposal(proposalId)),
  );

  server.registerTool(
    "teapot_apply_approved_proposal",
    {
      title: "Apply one explicitly approved proposal",
      description:
        "Consumes the browser-issued one-time approval token bound to player, MCP session, tool, patch digest, expected revision, and expiry. Map patches and undo operations run through the same Teapot publication and monotonic revision service as the browser. Paid calls remain browser-executed and cannot be run here.",
      inputSchema: ProposalIdInput.extend({
        approvalToken: z.string().min(32).max(2_048),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ proposalId, approvalToken }) =>
      toolResult(await api.applyProposal(proposalId, approvalToken)),
  );

  return server;
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: { result: value },
  };
}
