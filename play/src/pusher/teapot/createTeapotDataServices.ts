import type { TeapotDataRepository } from "./TeapotDataRepository";
import { LocalDevelopmentIdentityAdapter, TeapotIdentityService } from "./TeapotIdentityService";
import { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import { TeapotMapRevisionService } from "./TeapotMapRevisionService";

export function createTeapotDataServices(repository: TeapotDataRepository) {
    const authorization = new TeapotAuthorizationService(repository);
    const identity = new TeapotIdentityService(repository, authorization);
    return {
        repository,
        authorization,
        identity,
        localIdentity: new LocalDevelopmentIdentityAdapter(identity, repository),
        mapRevisions: new TeapotMapRevisionService(repository, authorization),
    };
}

export type TeapotDataServices = ReturnType<typeof createTeapotDataServices>;
