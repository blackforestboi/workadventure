import type { TeapotDataRepository } from "./TeapotDataRepository";
import { LocalDevelopmentIdentityAdapter, TeapotIdentityService } from "./TeapotIdentityService";
import { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import { TeapotMapRevisionService } from "./TeapotMapRevisionService";
import { TeapotMapStyleService } from "./TeapotMapStyleService";
import { TeapotRoomAccessService } from "./TeapotRoomAccessService";

export interface CreateTeapotDataServicesOptions {
    allowAllSignedInWamEditors?: boolean;
}

export function createTeapotDataServices(
    repository: TeapotDataRepository,
    options: CreateTeapotDataServicesOptions = {},
) {
    const authorization = new TeapotAuthorizationService(repository);
    const identity = new TeapotIdentityService(repository, authorization);
    const roomAccess = new TeapotRoomAccessService(
        repository,
        authorization,
        options.allowAllSignedInWamEditors ?? true,
    );
    return {
        repository,
        authorization,
        identity,
        roomAccess,
        localIdentity: new LocalDevelopmentIdentityAdapter(identity, repository),
        mapRevisions: new TeapotMapRevisionService(repository, roomAccess),
        mapStyles: new TeapotMapStyleService(repository, identity, authorization),
    };
}

export type TeapotDataServices = ReturnType<typeof createTeapotDataServices>;
