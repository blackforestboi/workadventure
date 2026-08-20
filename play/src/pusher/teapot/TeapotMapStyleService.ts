import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import type { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import { TEAPOT_MAP_STYLE_METADATA_VERSION } from "./TeapotMapStyleContracts";
import type {
    TeapotAssetKind,
    TeapotJsonValue,
    TeapotMapStyleEntryRecord,
    TeapotMapStyleRecord,
    TeapotMapStyleSourceLocator,
} from "./TeapotRecords";
import type { TeapotIdentityService } from "./TeapotIdentityService";
import { resolveTeapotOwnerIdentity, TEAPOT_WORKADVENTURE_IDENTITY_PROVIDER } from "./TeapotOwnerIdentityResolver";

export interface TeapotMapStyleView {
    id: string;
    name: string;
    isDefault: boolean;
    isBuiltIn: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface TeapotMapStyleEntryView {
    id: string;
    styleId: string;
    assetKind: TeapotAssetKind;
    source: TeapotMapStyleSourceLocator;
    metadataVersion: number;
    metadata: TeapotJsonValue;
    derivedFromAssetId: string | null;
    createdAt: string;
}

export interface TeapotBuiltInMapStyleSource {
    assetKind: TeapotAssetKind;
    metadata: TeapotJsonValue;
}

export interface TeapotBuiltInMapStyleResolver {
    resolve(namespace: string, key: string, sourceVersion: number): TeapotBuiltInMapStyleSource | null;
}

const noBuiltInSources: TeapotBuiltInMapStyleResolver = { resolve: () => null };

export class TeapotMapStyleService {
    constructor(
        private readonly repository: TeapotDataRepository,
        private readonly identity: TeapotIdentityService,
        private readonly authorization: TeapotAuthorizationService,
        private readonly builtInResolver: TeapotBuiltInMapStyleResolver = noBuiltInSources,
        private readonly identityProvider = TEAPOT_WORKADVENTURE_IDENTITY_PROVIDER,
    ) {}

    async list(
        providerSubject: string,
        styleId?: string,
        assetKind?: TeapotAssetKind,
    ): Promise<{ styles: TeapotMapStyleView[]; entries: TeapotMapStyleEntryView[] }> {
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.manage-own");
        const styles = await this.repository.listMapStyles(owner.id);
        const selectedStyleId = styleId ?? styles[0]?.id;
        const entries =
            selectedStyleId === undefined
                ? []
                : await this.repository.listMapStyleEntries(owner.id, selectedStyleId, assetKind);
        return { styles: styles.map(toStyleView), entries: entries.map(toEntryView) };
    }

    async create(providerSubject: string, name: string, idempotencyKey: string): Promise<TeapotMapStyleView> {
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.create");
        await this.authorization.assertCapability(owner.id, "asset.manage-own");
        return toStyleView(await this.repository.createMapStyle({ ownerId: owner.id, name, idempotencyKey }));
    }

    async copy(
        providerSubject: string,
        styleId: string,
        source: TeapotMapStyleSourceLocator,
        idempotencyKey: string,
    ): Promise<TeapotMapStyleEntryView> {
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.create");
        await this.authorization.assertCapability(owner.id, "asset.manage-own");
        const builtIn =
            source.type === "built-in"
                ? this.builtInResolver.resolve(source.namespace, source.key, source.sourceVersion)
                : undefined;
        if (source.type === "built-in" && builtIn === null) throw new TeapotMapStyleSourceUnavailableError();
        return toEntryView(
            await this.repository.copyMapStyleEntry({
                ownerId: owner.id,
                styleId,
                source,
                idempotencyKey,
                ...(builtIn == null
                    ? {}
                    : {
                          builtIn: {
                              assetKind: builtIn.assetKind,
                              metadataVersion: TEAPOT_MAP_STYLE_METADATA_VERSION,
                              metadataSnapshot: builtIn.metadata,
                          },
                      }),
            }),
        );
    }

    private resolveOwner(providerSubject: string): Promise<TeapotIdentity> {
        return resolveTeapotOwnerIdentity(this.repository, this.identity, providerSubject, this.identityProvider);
    }
}

export class TeapotMapStyleSourceUnavailableError extends Error {
    constructor() {
        super("The requested style or source is unavailable");
        this.name = "TeapotMapStyleSourceUnavailableError";
    }
}

function toStyleView(style: TeapotMapStyleRecord): TeapotMapStyleView {
    return {
        id: style.id,
        name: style.name,
        isDefault: style.isDefault,
        isBuiltIn: style.isBuiltIn,
        createdAt: style.createdAt,
        updatedAt: style.updatedAt,
    };
}

function toEntryView(entry: TeapotMapStyleEntryRecord): TeapotMapStyleEntryView {
    return {
        id: entry.id,
        styleId: entry.styleId,
        assetKind: entry.assetKind,
        source: entry.source,
        metadataVersion: entry.metadataVersion,
        metadata: entry.metadataSnapshot,
        derivedFromAssetId: entry.derivedFromAssetId,
        createdAt: entry.createdAt,
    };
}
