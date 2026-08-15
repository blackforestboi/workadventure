import type { VegetationPlacementPlan, WamFile, WAMEntityData } from "../..";
import { assertVegetationPlacementPlanDigest, VEGETATION_MAX_PLACEMENTS } from "../../Authoring/VegetationAuthoring";
import { VegetationPlacementPlan as VegetationPlacementPlanSchema } from "../../types";
import { Command } from "../Command";

export class CreateVegetationBatchCommand extends Command {
    public readonly plan: VegetationPlacementPlan;

    public constructor(
        protected readonly wamFile: WamFile,
        plan: VegetationPlacementPlan,
        commandId?: string,
    ) {
        super(commandId);
        this.plan = VegetationPlacementPlanSchema.parse(structuredClone(plan));
    }

    public execute(): Promise<void> {
        assertVegetationPlacementPlanDigest(this.plan);
        if (this.plan.placements.length > VEGETATION_MAX_PLACEMENTS)
            throw new Error("Vegetation batch exceeds the configured limits");
        const ids = new Set<string>();
        for (const placement of this.plan.placements) {
            if (ids.has(placement.id) || this.wamFile.getGameMapEntities().getEntity(placement.id)) {
                throw new Error(`Vegetation entity ${placement.id} already exists`);
            }
            ids.add(placement.id);
        }
        for (const placement of this.plan.placements) {
            const data: WAMEntityData = {
                prefabRef: placement.prefabRef,
                x: placement.x,
                y: placement.y,
                width: placement.width,
                height: placement.height,
            };
            if (!this.wamFile.getGameMapEntities().addEntity(placement.id, data)) {
                throw new Error(`Could not create vegetation entity ${placement.id}`);
            }
        }
        return Promise.resolve();
    }
}
