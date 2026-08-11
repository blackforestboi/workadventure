import type { Capabilities } from "@workadventure/messages";
import type { TeapotWokaService } from "../teapot/TeapotWokaService";
import { adminWokaService } from "./AdminWokaService";
import { GeneratedWokaOverlayService } from "./GeneratedWokaOverlayService";
import { localWokaService } from "./LocalWokaService";
import type { WokaServiceInterface } from "./WokaServiceInterface";

export class WokaService {
    private static instance: WokaServiceInterface | undefined;
    private static generatedWokas: TeapotWokaService | undefined;

    static configureGeneratedWokas(service: TeapotWokaService): void {
        WokaService.generatedWokas = service;
        WokaService.instance = undefined;
        localWokaService.setGeneratedWokaService(service);
    }

    static get(capabilities: Capabilities): WokaServiceInterface {
        if (!WokaService.instance) {
            const base = capabilities["api/woka/list"] === "v1" ? adminWokaService : localWokaService;
            // Generated IDs are resolved by LocalAdmin. Hosted Admin APIs need an equivalent owner-aware resolver
            // before their Woka list can safely advertise these private textures.
            WokaService.instance =
                WokaService.generatedWokas && base === localWokaService
                    ? new GeneratedWokaOverlayService(base, WokaService.generatedWokas)
                    : base;
        }
        return WokaService.instance;
    }
}
