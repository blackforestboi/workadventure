import * as z from "zod/v4";

const BoundedCoordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const BoundedSize = z.number().finite().positive().max(16_384);
const SafeName = z.string().trim().min(1).max(200);
const HttpsUrl = z
  .string()
  .url()
  .max(2_048)
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Only HTTPS URLs are accepted",
  );
const HttpUrl = z
  .string()
  .url()
  .max(2_048)
  .refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "Only HTTP(S) URLs are accepted",
  );

export const TeapotVegetationCategory = z.enum([
  "tree",
  "bush",
  "grass",
  "other",
]);

export const TeapotVegetationSpecies = z
  .object({
    collectionName: SafeName,
    prefabId: z.string().trim().min(1).max(200),
    name: SafeName,
    category: TeapotVegetationCategory,
    blocking: z.boolean(),
    footprintWidth: z.number().finite().positive().max(512),
    footprintHeight: z.number().finite().positive().max(512),
  })
  .strict();

export const TeapotVegetationRectangle = z
  .object({
    x: z.number().int().min(-1_000_000).max(1_000_000),
    y: z.number().int().min(-1_000_000).max(1_000_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const TeapotVegetationPreset = z
  .object({
    id: z.string().trim().min(1).max(200),
    name: SafeName,
    revision: z.number().int().positive(),
    density: z.number().finite().positive().max(1),
    minimumSpacing: z.number().finite().nonnegative().max(16),
    species: z
      .array(
        z
          .object({
            collectionName: SafeName,
            prefabId: z.string().trim().min(1).max(200),
            weight: z.number().finite().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict();

export const TeapotVegetationFillPreview = z
  .object({
    mapRevision: z.string().min(1).max(200),
    presetId: z.string().min(1).max(200),
    presetRevision: z.number().int().positive(),
    seed: z.string().min(1).max(200),
    rectangle: TeapotVegetationRectangle,
    acceptedCount: z.number().int().nonnegative().max(500),
    skippedCount: z.number().int().nonnegative().max(4_096),
    digest: z.string().regex(/^[0-9a-f]{32}$/),
  })
  .strict();

export type TeapotVegetationCategory = z.infer<typeof TeapotVegetationCategory>;
export type TeapotVegetationSpecies = z.infer<typeof TeapotVegetationSpecies>;
export type TeapotVegetationPreset = z.infer<typeof TeapotVegetationPreset>;
export type TeapotVegetationFillPreview = z.infer<
  typeof TeapotVegetationFillPreview
>;

export const TeapotInteractionProperty = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("collision"),
      enabled: z
        .boolean()
        .describe("Whether players collide with this element."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("depth"),
      offset: z
        .number()
        .int()
        .min(-4_096)
        .max(4_096)
        .describe("Draw-order offset in game pixels."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("open-website"),
      url: HttpsUrl.describe("HTTPS page to open inside WorkAdventure."),
      trigger: z.enum(["enter", "action"]).default("action"),
      triggerMessage: z.string().trim().min(1).max(160).optional(),
      allowApi: z.boolean().default(false),
      closable: z.boolean().default(true),
      widthPercent: z.number().int().min(20).max(100).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("open-tab"),
      url: HttpsUrl.describe("HTTPS page to open in a new browser tab."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("exit"),
      mapUrl: HttpUrl.describe(
        "WorkAdventure room URL used when entering the element.",
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("play-audio"),
      url: HttpsUrl.describe(
        "HTTPS audio file played while the player is in the element.",
      ),
      loop: z.boolean().default(false),
      volume: z.number().finite().min(0).max(1).default(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("silent-zone"),
      enabled: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("named-zone"),
      name: SafeName.describe(
        "Stable zone name surfaced to the scripting API.",
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("meeting"),
      provider: z.literal("jitsi"),
      room: z.string().trim().min(1).max(200),
      trigger: z.enum(["enter", "action"]).default("action"),
      triggerMessage: z.string().trim().min(1).max(160).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("camera-zoom"),
      margin: z.number().int().min(0).max(2_048),
    })
    .strict(),
]);

export type TeapotInteractionProperty = z.infer<
  typeof TeapotInteractionProperty
>;

const InteractionProperties = z
  .array(TeapotInteractionProperty)
  .max(24)
  .superRefine((properties, context) => {
    const kinds = new Set<string>();
    properties.forEach((property, index) => {
      if (kinds.has(property.kind)) {
        context.addIssue({
          code: "custom",
          path: [index, "kind"],
          message: `Interaction property ${property.kind} may appear only once per element`,
        });
      }
      kinds.add(property.kind);
    });
  });

const ObjectPlacement = z
  .object({
    layer: SafeName.describe("Name of an existing Tiled object layer."),
    clientReference: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe("Stable reference local to this patch."),
    name: SafeName,
    x: BoundedCoordinate,
    y: BoundedCoordinate,
    width: BoundedSize,
    height: BoundedSize,
    rotation: z.number().finite().min(-360).max(360).default(0),
    visible: z.boolean().default(true),
    properties: InteractionProperties.default([]),
  })
  .strict();

export const TeapotMapOperation = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("import-tileset"),
      assetId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .describe(
          "Owner-scoped Teapot tileset asset ID returned by paid generation.",
        ),
      name: SafeName.describe("Safe unique name for the embedded TMJ tileset."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("paint-region"),
      layer: SafeName.describe("Name of an existing finite tile layer."),
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().positive().max(256),
      height: z.number().int().positive().max(256),
      gids: z.array(z.number().int().nonnegative()).max(256 * 256),
    })
    .strict()
    .superRefine((operation, context) => {
      if (operation.gids.length !== operation.width * operation.height) {
        context.addIssue({
          code: "custom",
          path: ["gids"],
          message: `Expected ${operation.width * operation.height} tile GIDs`,
        });
      }
    }),
  ObjectPlacement.extend({
    kind: z.literal("place-tile-object"),
    gid: z
      .number()
      .int()
      .positive()
      .describe("Existing global tile ID, including any flip flags."),
  }).strict(),
  ObjectPlacement.extend({
    kind: z.literal("place-zone"),
  }).strict(),
  z
    .object({
      kind: z.literal("update-object"),
      layer: SafeName,
      objectId: z.number().int().positive(),
      name: SafeName.optional(),
      x: BoundedCoordinate.optional(),
      y: BoundedCoordinate.optional(),
      width: BoundedSize.optional(),
      height: BoundedSize.optional(),
      rotation: z.number().finite().min(-360).max(360).optional(),
      visible: z.boolean().optional(),
      properties: InteractionProperties.optional(),
    })
    .strict()
    .refine(
      (operation) =>
        operation.name !== undefined ||
        operation.x !== undefined ||
        operation.y !== undefined ||
        operation.width !== undefined ||
        operation.height !== undefined ||
        operation.rotation !== undefined ||
        operation.visible !== undefined ||
        operation.properties !== undefined,
      "An update-object operation must change at least one field",
    ),
  z
    .object({
      kind: z.literal("remove-object"),
      layer: SafeName,
      objectId: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("define-tile-animation"),
      tileset: SafeName.describe("Name of an existing embedded tileset."),
      tileId: z
        .number()
        .int()
        .nonnegative()
        .describe("Local tile ID in the selected tileset."),
      frames: z
        .array(
          z
            .object({
              tileId: z.number().int().nonnegative(),
              durationMs: z.number().int().min(16).max(60_000),
            })
            .strict(),
        )
        .min(2)
        .max(64),
    })
    .strict(),
]);

export type TeapotMapOperation = z.infer<typeof TeapotMapOperation>;

export const TeapotMapPatch = z
  .object({
    mapUrl: z.string().url().max(2_048),
    expectedRevision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(120),
    rationale: z.string().trim().min(1).max(2_000),
    operations: z.array(TeapotMapOperation).min(1).max(128),
  })
  .strict()
  .superRefine((patch, context) => {
    const references = new Set<string>();
    const tilesetAssetIds = new Set<string>();
    const tilesetNames = new Set<string>();
    patch.operations.forEach((operation, index) => {
      if (operation.kind === "import-tileset") {
        if (tilesetAssetIds.has(operation.assetId)) {
          context.addIssue({
            code: "custom",
            path: ["operations", index, "assetId"],
            message: "A tileset asset may be imported only once inside a patch",
          });
        }
        if (tilesetNames.has(operation.name)) {
          context.addIssue({
            code: "custom",
            path: ["operations", index, "name"],
            message: "An imported tileset name must be unique inside a patch",
          });
        }
        tilesetAssetIds.add(operation.assetId);
        tilesetNames.add(operation.name);
        return;
      }
      if (
        operation.kind !== "place-tile-object" &&
        operation.kind !== "place-zone"
      )
        return;
      if (references.has(operation.clientReference)) {
        context.addIssue({
          code: "custom",
          path: ["operations", index, "clientReference"],
          message: "clientReference must be unique inside a patch",
        });
      }
      references.add(operation.clientReference);
    });
  });

export type TeapotMapPatch = z.infer<typeof TeapotMapPatch>;

export const TeapotPaidGenerationRequest = z
  .object({
    purpose: z.enum([
      "avatar",
      "avatar-part",
      "map-entity",
      "tileset",
      "reference",
    ]),
    prompt: z.string().trim().min(1).max(4_000),
    targetAssetClass: z.string().trim().min(1).max(120),
    referenceCount: z.number().int().nonnegative().max(8).default(0),
    output: z
      .object({
        width: z.number().int().positive().max(4_096),
        height: z.number().int().positive().max(4_096),
        transparent: z.boolean(),
        frameLayout: z.enum(["single", "woka-3x4", "tileset"]),
      })
      .strict(),
    estimatedMaximumCostUsd: z.number().finite().positive().max(100).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.purpose === "avatar" || request.purpose === "avatar-part") {
      if (
        request.output.frameLayout !== "woka-3x4" ||
        request.output.width !== 96 ||
        request.output.height !== 128 ||
        !request.output.transparent
      ) {
        context.addIssue({
          code: "custom",
          path: ["output"],
          message:
            "Woka generation requires a transparent 96x128 sheet with 3 columns and 4 rows",
        });
      }
    }
    if (
      request.purpose === "tileset" &&
      (request.output.frameLayout !== "tileset" ||
        request.output.width !== 32 ||
        request.output.height !== 32)
    ) {
      context.addIssue({
        code: "custom",
        path: ["output"],
        message: "Terrain generation requires exactly one 32x32 tile",
      });
    }
    if (
      (request.purpose === "map-entity" || request.purpose === "reference") &&
      request.output.frameLayout !== "single"
    ) {
      context.addIssue({
        code: "custom",
        path: ["output", "frameLayout"],
        message:
          "Map entities and references require a single-image frame layout",
      });
    }
  });

export type TeapotPaidGenerationRequest = z.infer<
  typeof TeapotPaidGenerationRequest
>;

export const TEAPOT_AUTHORING_VOCABULARY = {
  contractVersion: 1,
  formats: {
    map: "finite orthogonal TMJ with embedded single-image tilesets",
    avatar:
      "96x128 transparent PNG Woka sheet (3 columns x 4 directional rows, 3 walk frames per row)",
    generatedEntity:
      "transparent raster accepted through the owner-scoped custom entity catalog",
  },
  vegetation: {
    categories: ["tree", "bush", "grass", "other"],
    selection: "positive tile-aligned rectangle",
    maximumAcceptedInstances: 500,
    deterministicPreview:
      "The same map revision, preset revision, rectangle, and seed resolves to the same concrete placements and digest.",
    approval:
      "Agents may inspect semantic species and presets and draft a resolved fill, but applying it uses the existing explicit browser approval and one-time token lifecycle.",
    privacy:
      "Results expose stable map-owned prefab references and semantic metadata, never private generated-asset URLs or another owner's records.",
  },
  elementTypes: [
    {
      type: "tileset-import",
      operation: "import-tileset",
      purpose:
        "Resolve an owner-scoped generated tileset asset and embed it into the isolated TMJ draft before publication.",
      constraints: [
        "owner asset ID only; never a caller URL",
        "published PNG tileset",
        "server-derived dimensions and canonical URL",
        "unique safe name",
        "publication remains a separate approval",
      ],
    },
    {
      type: "tile-region",
      operation: "paint-region",
      purpose:
        "Paint ground, paths, walls, or decorative tile regions with existing global tile IDs.",
      constraints: [
        "existing tile layer",
        "in-bounds rectangle",
        "known GIDs only",
        "maximum 256x256",
      ],
    },
    {
      type: "tile-object",
      operation: "place-tile-object",
      purpose:
        "Place one existing tile as a positioned object such as a tree, table, sign, or building detail.",
      constraints: [
        "existing object layer",
        "known GID",
        "bounded size and rotation",
      ],
    },
    {
      type: "zone",
      operation: "place-zone",
      purpose:
        "Create a rectangular invisible interaction area for websites, audio, exits, meetings, or scripts.",
      constraints: [
        "existing object layer",
        "at least one meaningful property recommended",
      ],
    },
    {
      type: "object-update",
      operation: "update-object",
      purpose:
        "Move, resize, rename, hide, rotate, or replace approved interaction properties on an existing object.",
      constraints: [
        "numeric server-assigned object ID",
        "existing object layer",
      ],
    },
    {
      type: "tile-animation",
      operation: "define-tile-animation",
      purpose:
        "Attach an ordered, timed frame sequence to an existing local tile ID.",
      constraints: [
        "embedded tileset",
        "existing frame tile IDs",
        "16-60000ms per frame",
      ],
    },
  ],
  interactionProperties: [
    "collision",
    "depth",
    "open-website",
    "open-tab",
    "exit",
    "play-audio",
    "silent-zone",
    "named-zone",
    "meeting",
    "camera-zoom",
  ],
  safety: [
    "Never submit raw TMJ, WAM, JavaScript, shell commands, HTML, or arbitrary property bags.",
    "Read capabilities and the map summary before drafting a patch.",
    "Validate before proposing; proposals do not mutate the map.",
    "Every mutation or paid generation requires explicit browser approval and a one-time bound token.",
    "If the map revision changes, the proposal becomes stale and must be regenerated.",
  ],
} as const;
