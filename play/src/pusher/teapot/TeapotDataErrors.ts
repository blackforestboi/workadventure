export class TeapotDataConflictError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

export class TeapotDataNotFoundError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

export class TeapotAuthorizationError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

export class TeapotMapRevisionConflictError extends TeapotDataConflictError {}

export class TeapotMapWriterLeaseConflictError extends TeapotDataConflictError {}

export class TeapotRestoreConflictError extends TeapotDataConflictError {}

export class TeapotAdmissionTokenError extends TeapotAuthorizationError {}

export class TeapotAdmissionConflictError extends TeapotDataConflictError {}

export class TeapotOAuthError extends TeapotAuthorizationError {}
