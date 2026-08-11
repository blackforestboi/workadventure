import type { TeapotMapPatch } from "./domain.js";
import type { TeapotPatchValidation } from "./proposals.js";
import { digestCanonicalJson } from "./canonicalJson.js";

export function validateTeapotPatchContract(
  patch: TeapotMapPatch,
): TeapotPatchValidation {
  const warnings: string[] = [];
  let changedTileUpperBound = 0;
  let placedObjects = 0;
  let removedObjects = 0;
  const importedTilesets: TeapotPatchValidation["importedTilesets"] = [];

  for (const operation of patch.operations) {
    switch (operation.kind) {
      case "import-tileset":
        importedTilesets.push({
          assetId: operation.assetId,
          name: operation.name,
          firstGid: null,
          lastGidExclusive: null,
          tileCount: null,
        });
        break;
      case "paint-region":
        changedTileUpperBound += operation.width * operation.height;
        break;
      case "place-tile-object":
      case "place-zone":
        placedObjects += 1;
        if (
          operation.properties.length === 0 &&
          operation.kind === "place-zone"
        ) {
          warnings.push(
            `Zone ${operation.clientReference} has no interaction properties`,
          );
        }
        break;
      case "remove-object":
        removedObjects += 1;
        break;
      case "update-object":
      case "define-tile-animation":
        break;
      default: {
        const exhaustive: never = operation;
        throw new Error(`Unsupported Teapot operation: ${String(exhaustive)}`);
      }
    }
  }

  if (changedTileUpperBound > 16_384) {
    warnings.push(
      "This proposal paints more than 16,384 tiles; consider splitting it for easier review",
    );
  }
  return {
    valid: true,
    digest: digestCanonicalJson(patch),
    operationCount: patch.operations.length,
    changedTileUpperBound,
    importedTilesets,
    warnings,
    summary: `${patch.title}: ${patch.operations.length} operation(s), ${importedTilesets.length} tileset(s) imported, up to ${changedTileUpperBound} tile change(s), ${placedObjects} object(s) placed, ${removedObjects} removed.`,
  };
}
