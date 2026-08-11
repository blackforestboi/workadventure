import type { TeapotCapability, TeapotIdentityContext, TeapotRole } from "../../common/Teapot/TeapotIdentity";
import { TeapotAuthorizationError, TeapotDataNotFoundError } from "./TeapotDataErrors";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import type { TeapotOwnedRecord } from "./TeapotRecords";

const ROLE_CAPABILITIES: Readonly<Record<TeapotRole, readonly TeapotCapability[]>> = {
    member: ["asset.create", "asset.manage-own"],
    creator: [
        "world.enter",
        "asset.create",
        "asset.manage-own",
        "map.edit",
        "map.publish",
        "mcp.connect",
        "mcp.approve",
        "endorsement.create",
    ],
    moderator: [
        "world.enter",
        "asset.create",
        "asset.manage-own",
        "asset.manage-any",
        "map.edit",
        "map.publish",
        "map.manage-any",
        "mcp.connect",
        "mcp.approve",
        "endorsement.create",
    ],
    operator: [
        "world.enter",
        "asset.create",
        "asset.manage-own",
        "asset.manage-any",
        "map.edit",
        "map.publish",
        "map.manage-any",
        "mcp.connect",
        "mcp.approve",
        "endorsement.create",
        "identity.manage",
    ],
};

export class TeapotAuthorizationService {
    constructor(private readonly repository: TeapotDataRepository) {}

    async getIdentityContext(userId: string): Promise<TeapotIdentityContext> {
        const identity = await this.repository.getIdentity(userId);
        if (identity === null) {
            throw new TeapotDataNotFoundError(`Teapot user ${userId} does not exist`);
        }
        const roles = await this.repository.listRoles(userId);
        const grants = await this.repository.listCapabilityGrants(userId);
        const capabilities = new Set<TeapotCapability>(grants);
        for (const role of roles) {
            for (const capability of ROLE_CAPABILITIES[role]) {
                capabilities.add(capability);
            }
        }
        return { identity, roles, capabilities: [...capabilities].sort() };
    }

    async hasCapability(userId: string, capability: TeapotCapability): Promise<boolean> {
        const context = await this.getIdentityContext(userId);
        return context.capabilities.includes(capability);
    }

    async assertCapability(userId: string, capability: TeapotCapability): Promise<void> {
        if (!(await this.hasCapability(userId, capability))) {
            throw new TeapotAuthorizationError(`User ${userId} lacks capability ${capability}`);
        }
    }

    async assertOwnedRecordAccess(
        userId: string,
        record: TeapotOwnedRecord,
        ownCapability: TeapotCapability,
        anyOwnerCapability: TeapotCapability,
    ): Promise<void> {
        await this.assertCapability(userId, record.ownerId === userId ? ownCapability : anyOwnerCapability);
    }

    async getAssetForManagement(userId: string, assetId: string) {
        const asset = await this.repository.getAsset(assetId);
        if (asset === null) {
            throw new TeapotDataNotFoundError(`Teapot asset ${assetId} does not exist`);
        }
        await this.assertOwnedRecordAccess(userId, asset, "asset.manage-own", "asset.manage-any");
        return asset;
    }

    async getCatalogForManagement(userId: string, catalogId: string) {
        const catalog = await this.repository.getCatalog(catalogId);
        if (catalog === null) {
            throw new TeapotDataNotFoundError(`Teapot catalog ${catalogId} does not exist`);
        }
        await this.assertOwnedRecordAccess(userId, catalog, "asset.manage-own", "asset.manage-any");
        return catalog;
    }
}

export { ROLE_CAPABILITIES };
