import type { TeapotIdentity, TeapotRole } from "../../common/Teapot/TeapotIdentity";
import { TeapotAuthorizationError, TeapotDataNotFoundError } from "./TeapotDataErrors";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import type { TeapotAuthorizationService } from "./TeapotAuthorizationService";

export interface ResolveProviderIdentityInput {
    provider: string;
    providerSubject: string;
    displayName?: string;
}

export interface ResolveLocalDevelopmentIdentityInput {
    localSubject: string;
    displayName?: string;
    initialRoles?: TeapotRole[];
}

export class TeapotIdentityService {
    constructor(
        private readonly repository: TeapotDataRepository,
        private readonly authorization: TeapotAuthorizationService,
    ) {}

    async resolveProviderIdentity(input: ResolveProviderIdentityInput): Promise<TeapotIdentity> {
        this.assertProviderValue(input.provider, "provider");
        this.assertProviderValue(input.providerSubject, "provider subject");
        return this.repository.resolveIdentity(input);
    }

    async linkProvider(
        actorId: string,
        targetUserId: string,
        provider: string,
        providerSubject: string,
    ): Promise<void> {
        if (actorId !== targetUserId) {
            await this.authorization.assertCapability(actorId, "identity.manage");
        }
        if ((await this.repository.getIdentity(targetUserId)) === null) {
            throw new TeapotDataNotFoundError(`Teapot user ${targetUserId} does not exist`);
        }
        this.assertProviderValue(provider, "provider");
        this.assertProviderValue(providerSubject, "provider subject");
        await this.repository.linkProvider(targetUserId, provider, providerSubject);
    }

    private assertProviderValue(value: string, label: string): void {
        if (value.trim().length === 0) {
            throw new TeapotAuthorizationError(`Identity ${label} cannot be empty`);
        }
    }
}

export class LocalDevelopmentIdentityAdapter {
    static readonly provider = "local-development";

    constructor(
        private readonly identityService: TeapotIdentityService,
        private readonly repository: TeapotDataRepository,
    ) {}

    async resolve(input: ResolveLocalDevelopmentIdentityInput): Promise<TeapotIdentity> {
        const identity = await this.identityService.resolveProviderIdentity({
            provider: LocalDevelopmentIdentityAdapter.provider,
            providerSubject: input.localSubject,
            displayName: input.displayName,
        });
        await Promise.all((input.initialRoles ?? []).map((role) => this.repository.addRole(identity.id, role)));
        return identity;
    }
}
