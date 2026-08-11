import { describe, expect, it } from "vitest";

import {
  TeapotMapPatch,
  TeapotPaidGenerationCompletionResult,
  TeapotPaidGenerationRequest,
  canonicalJson,
  digestCanonicalJson,
  validateTeapotPatchContract,
} from "../src/contracts/index.js";

describe("Teapot MCP authoring contracts", () => {
  it("produces a stable digest independent of object key order", () => {
    expect(digestCanonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      digestCanonicalJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("rejects duplicate client references and arbitrary properties", () => {
    const base = {
      mapUrl: "https://maps.example.test/world.tmj",
      expectedRevision: 4,
      title: "Add two trees",
      rationale: "Make the square greener",
    };
    const duplicated = TeapotMapPatch.safeParse({
      ...base,
      operations: [
        {
          kind: "place-tile-object",
          layer: "objects",
          clientReference: "tree",
          name: "Tree one",
          x: 32,
          y: 32,
          width: 32,
          height: 64,
          gid: 10,
        },
        {
          kind: "place-zone",
          layer: "objects",
          clientReference: "tree",
          name: "Tree link",
          x: 32,
          y: 64,
          width: 32,
          height: 32,
          properties: [{ kind: "arbitrary-script", value: "alert(1)" }],
        },
      ],
    });

    expect(duplicated.success).toBe(false);
  });

  it("drafts bounded review metadata without mutating anything", () => {
    const patch = TeapotMapPatch.parse({
      mapUrl: "https://maps.example.test/world.tmj",
      expectedRevision: 4,
      title: "Paint a path",
      rationale: "Connect the garden",
      operations: [
        {
          kind: "paint-region",
          layer: "ground",
          x: 1,
          y: 2,
          width: 2,
          height: 2,
          gids: [1, 1, 1, 1],
        },
      ],
    });

    expect(validateTeapotPatchContract(patch)).toMatchObject({
      valid: true,
      operationCount: 1,
      changedTileUpperBound: 4,
      warnings: [],
    });
  });

  it("drafts an owner asset tileset import without accepting a URL or dimensions", () => {
    const patch = TeapotMapPatch.parse({
      mapUrl: "https://maps.example.test/world.tmj",
      expectedRevision: 4,
      title: "Import forest tiles",
      rationale: "Use the already generated owner asset",
      operations: [
        {
          kind: "import-tileset",
          assetId: "tileset_asset_1",
          name: "Forest floor",
        },
      ],
    });

    expect(validateTeapotPatchContract(patch)).toMatchObject({
      importedTilesets: [
        {
          assetId: "tileset_asset_1",
          name: "Forest floor",
          firstGid: null,
          lastGidExclusive: null,
          tileCount: null,
        },
      ],
    });
    expect(
      TeapotMapPatch.safeParse({
        ...patch,
        operations: [
          {
            kind: "import-tileset",
            assetId: "tileset_asset_1",
            name: "Forest floor",
            image: "https://attacker.example/tiles.png",
            imageWidth: 256,
            imageHeight: 256,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("allows only bounded non-secret paid-generation completion metadata", () => {
    expect(
      TeapotPaidGenerationCompletionResult.parse({
        status: "accepted-asset",
        assetId: "asset_123",
        assetUrl: "https://play.example.test/teapot/woka-assets/asset_123.png",
        assetKind: "woka",
        providerId: "openrouter",
        modelId: "image-model",
        mediaType: "image/png",
        byteLength: 12_345,
      }),
    ).toMatchObject({
      status: "accepted-asset",
      assetId: "asset_123",
      providerId: "openrouter",
    });

    expect(
      TeapotPaidGenerationCompletionResult.safeParse({
        status: "accepted-asset",
        assetId: "asset_123",
        assetUrl: "https://play.example.test/teapot/woka-assets/asset_123.png",
        assetKind: "woka",
        providerId: "openrouter",
        modelId: "image-model",
        mediaType: "image/png",
        byteLength: 12_345,
        apiKey: "must-never-enter-the-proposal-result",
      }).success,
    ).toBe(false);

    expect(
      TeapotPaidGenerationCompletionResult.safeParse({
        status: "accepted-candidate",
        disposition: "ephemeral-browser-candidate",
        providerId: "openrouter",
        modelId: "image-model",
        mediaType: "image/png",
        byteLength: 12_345,
      }).success,
    ).toBe(false);
  });

  it("enforces WorkAdventure's 3-column by 4-row Woka output contract", () => {
    const request = {
      purpose: "avatar",
      prompt: "A fox botanist",
      targetAssetClass: "complete-woka",
      output: {
        width: 96,
        height: 128,
        transparent: true,
        frameLayout: "woka-3x4",
      },
    };

    expect(TeapotPaidGenerationRequest.safeParse(request).success).toBe(true);
    expect(
      TeapotPaidGenerationRequest.safeParse({
        ...request,
        output: { ...request.output, frameLayout: "single" },
      }).success,
    ).toBe(false);
  });

  it("enforces one 32x32 tile for terrain generation", () => {
    const request = {
      purpose: "tileset",
      prompt: "A seamless moss floor",
      targetAssetClass: "terrain-tile",
      output: {
        width: 32,
        height: 32,
        transparent: false,
        frameLayout: "tileset",
      },
    };

    expect(TeapotPaidGenerationRequest.safeParse(request).success).toBe(true);
    expect(
      TeapotPaidGenerationRequest.safeParse({
        ...request,
        output: { ...request.output, width: 256, height: 256 },
      }).success,
    ).toBe(false);
  });
});
