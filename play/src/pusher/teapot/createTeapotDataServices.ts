import type { TeapotDataRepository } from "./TeapotDataRepository";
import { LocalDevelopmentIdentityAdapter, TeapotIdentityService } from "./TeapotIdentityService";
import { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import { TeapotMapRevisionService } from "./TeapotMapRevisionService";
import { TeapotRoomAccessService } from "./TeapotRoomAccessService";

export function createTeapotDataServices(repository: TeapotDataRepository) {
    const authorization = new TeapotAuthorizationService(repository);
    const identity = new TeapotIdentityService(repository, authorization);
    const roomAccess = new TeapotRoomAccessService(repository, authorization);
    return {
        repository,
        authorization,
        identity,
        roomAccess,
        localIdentity: new LocalDevelopmentIdentityAdapter(identity, repository),
        mapRevisions: new TeapotMapRevisionService(repository, roomAccess),
    };
}

export type TeapotDataServices = ReturnType<typeof createTeapotDataServices>;
