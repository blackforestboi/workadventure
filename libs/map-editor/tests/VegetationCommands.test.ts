import { describe, expect, it } from "vitest";
import {
    CreateVegetationBatchCommand,
    DeleteCustomEntityCommand,
    DeleteVegetationPresetCommand,
    UpsertVegetationPresetCommand,
    WamFile,
    createVegetationPlanDigest,
    type VegetationPlacementPlan,
    VegetationPlacementPlan as VegetationPlacementPlanSchema,
    type VegetationPreset,
    type WAMFileFormat,
} from "../src";

function wam(overrides: Partial<WAMFileFormat> = {}): WAMFileFormat {
    return {
        version: "1.0.0",
        mapUrl: "https://example.test/map.json",
        entities: {},
        areas: [],
        entityCollections: [],
        ...overrides,
    };
}

const preset: VegetationPreset = {
    version: 1,
    id: "forest",
    name: "Forest",
    revision: 0,
    density: 0.5,
    minimumSpacing: 1,
    species: [{ prefabRef: { collectionName: "nature", id: "pine" }, weight: 1 }],
};

describe("vegetation commands", () => {
    it("upserts with monotonic revisions and rejects stale edits", async () => {
        const data = wam();
        const create = new UpsertVegetationPresetCommand(data, preset, 0);
        await create.execute();
        expect(create.preset.revision).toBe(1);
        expect(data.vegetationPresets?.presets).toEqual([create.preset]);

        expect(() => new UpsertVegetationPresetCommand(data, { ...preset, name: "Old" }, 0).execute()).toThrow(
            /revision mismatch/,
        );
        const update = new UpsertVegetationPresetCommand(data, { ...create.preset, name: "Dense forest" }, 1);
        await update.execute();
        expect(update.preset.revision).toBe(2);
    });

    it("deletes presets without touching placed instances", async () => {
        const data = wam({
            entities: { pine1: { prefabRef: { collectionName: "nature", id: "pine" }, x: 1, y: 2 } },
            vegetationPresets: { version: 1, presets: [{ ...preset, revision: 1 }] },
        });
        await new DeleteVegetationPresetCommand(data, preset.id, 1).execute();
        expect(data.vegetationPresets?.presets).toEqual([]);
        expect(data.entities.pine1).toBeDefined();
    });

    it("creates a resolved batch atomically after validating its digest", async () => {
        const file = new WamFile(wam());
        const partial = {
            version: 1 as const,
            presetId: "forest",
            presetRevision: 1,
            seed: "seed",
            rectangle: { x: 0, y: 0, width: 2, height: 1 },
            placements: [
                {
                    id: "tree-1",
                    prefabRef: { collectionName: "nature", id: "pine" },
                    x: 0.5,
                    y: 0.5,
                    width: 1,
                    height: 1,
                },
            ],
            skipped: [],
        };
        const normalized = VegetationPlacementPlanSchema.parse({ ...partial, digest: "0".repeat(32) });
        const { digest: _placeholder, ...parsedContent } = normalized;
        const plan: VegetationPlacementPlan = { ...normalized, digest: createVegetationPlanDigest(parsedContent) };
        await new CreateVegetationBatchCommand(file, plan).execute();
        expect(file.getGameMapEntities().getEntity("tree-1")?.prefabRef.id).toBe("pine");

        const invalid: VegetationPlacementPlan = { ...plan, placements: [{ ...plan.placements[0], id: "tree-2" }] };
        expect(() => new CreateVegetationBatchCommand(file, invalid).execute()).toThrow(/digest/);
        expect(file.getGameMapEntities().getEntity("tree-2")).toBeUndefined();
    });

    it("creates a correctly digested batch for a selection larger than 64 tiles", async () => {
        const file = new WamFile(wam());
        const partial = {
            version: 1 as const,
            presetId: "forest",
            presetRevision: 1,
            seed: "large-selection",
            rectangle: { x: 0, y: 0, width: 65, height: 65 },
            placements: [
                {
                    id: "large-selection-tree",
                    prefabRef: { collectionName: "nature", id: "pine" },
                    x: 0.5,
                    y: 0.5,
                    width: 1,
                    height: 1,
                },
            ],
            skipped: [],
        };
        const normalized = VegetationPlacementPlanSchema.parse({ ...partial, digest: "0".repeat(32) });
        const { digest: _placeholder, ...parsedContent } = normalized;
        const plan: VegetationPlacementPlan = { ...normalized, digest: createVegetationPlanDigest(parsedContent) };

        await new CreateVegetationBatchCommand(file, plan).execute();

        expect(file.getGameMapEntities().getEntity("large-selection-tree")?.prefabRef.id).toBe("pine");
    });

    it("blocks deletion while a vegetation prefab is referenced", async () => {
        const file = new WamFile(wam({ vegetationPresets: { version: 1, presets: [{ ...preset, revision: 1 }] } }));
        expect(() => new DeleteCustomEntityCommand({ id: "pine" }, file).execute()).toThrow(/in use/);
    });
});
