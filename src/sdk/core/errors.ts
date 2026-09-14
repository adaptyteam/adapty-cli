/**
 * Sdk errors carry no user-facing text and no exit code: the adapter assigns both
 * (src/cli/errors.ts, and a future MCP server).
 *
 * Every error has a stable `kind`, and the adapter switches over it. An instanceof chain would
 * let a new error class fall through to the fallback and become exit 1 with no readable text.
 */

export type SdkErrorKind
    = | 'api'
        | 'auth_required'
        | 'cancelled'
        | 'device_flow_denied'
        | 'device_flow_expired'
        | 'network'
        | 'storage'
        | 'validation';

/** Abstract on purpose: `new SdkError(...)` would be an error without a kind, unrecognisable. */
export abstract class SdkError extends Error {
    abstract readonly kind: SdkErrorKind;

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

/** No response at all: DNS, refused connection, a dropped socket. */
export class NetworkError extends SdkError {
    readonly kind = 'network';
    readonly url: string;

    constructor(url: string, cause: unknown) {
        super(`Request to ${url} failed`, { cause });
        this.url = url;
    }
}

/** The server answered with an error. `code` and `details` follow the service's own format. */
export class ApiError extends SdkError {
    readonly kind = 'api';
    readonly code: string | undefined;
    readonly details: unknown;
    readonly retryAfterMs: number | undefined;
    readonly status: number;

    constructor(init: {
        code?: string | undefined;
        details?: unknown;
        message: string;
        retryAfterMs?: number | undefined;
        status: number;
    }) {
        super(init.message);
        this.status = init.status;
        this.code = init.code;
        this.details = init.details;
        this.retryAfterMs = init.retryAfterMs;
    }
}

/** missing: no token stored locally. rejected: the server answered 401. */
export type AuthRequiredReason = 'missing' | 'rejected';

export class AuthRequiredError extends SdkError {
    readonly kind = 'auth_required';
    readonly reason: AuthRequiredReason;

    constructor(reason: AuthRequiredReason) {
        super(reason === 'missing' ? 'Not authenticated' : 'Token expired or invalid');
        this.reason = reason;
    }
}

export class CancelledError extends SdkError {
    readonly kind = 'cancelled';

    constructor() {
        super('Operation cancelled');
    }
}

export type Issue = {
    message: string;
    /** The input field the problem belongs to. No path: the input as a whole is wrong. */
    path?: string | undefined;
};

/** A business rule broken before any network call. */
export class ValidationError extends SdkError {
    readonly kind = 'validation';
    readonly issues: readonly Issue[];

    constructor(issues: readonly Issue[]) {
        super(issues.map(issue => (issue.path === undefined ? issue.message : `${issue.path}: ${issue.message}`)).join('; '));
        this.issues = issues;
    }
}

export class DeviceFlowExpiredError extends SdkError {
    readonly kind = 'device_flow_expired';

    constructor() {
        super('Device code expired before authorization');
    }
}

export class DeviceFlowDeniedError extends SdkError {
    readonly kind = 'device_flow_denied';

    constructor() {
        super('Authorization denied');
    }
}

/** The session file is there but unusable: corrupted JSON, or something else in its place. */
export class StorageError extends SdkError {
    readonly kind = 'storage';
    readonly path: string;

    constructor(message: string, path: string, options?: ErrorOptions) {
        super(message, options);
        this.path = path;
    }
}

/**
 * Every concrete error: a switch over `kind` narrows to the class. instanceof on the abstract
 * base gives the base, without .status, .url or .issues.
 */
export type AnySdkError
    = | ApiError
        | AuthRequiredError
        | CancelledError
        | DeviceFlowDeniedError
        | DeviceFlowExpiredError
        | NetworkError
        | StorageError
        | ValidationError;

export const isSdkError = (error: unknown): error is AnySdkError => error instanceof SdkError;

type Assert<T extends true> = T;

/** Safety net: a kind whose class never made it into AnySdkError breaks the build here. */
export type AllKindsCovered = Assert<SdkErrorKind extends AnySdkError['kind'] ? true : false>;

export const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';
