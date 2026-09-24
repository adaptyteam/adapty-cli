import { systemClock } from '../core/clock.js';
import { createHttp } from '../core/http/index.js';

import { accessLevels } from './access-levels.js';
import { apps } from './apps/index.js';
import { auth } from './auth/index.js';
import { developerErrorParser } from './errors.js';
import { migrations } from './migrations/index.js';

import type { AccessLevelsApi } from './access-levels.js';
import type { AppsApi } from './apps/index.js';
import type { AuthApi } from './auth/index.js';
import type { MigrationApi } from './migrations/index.js';
import type { Clock } from '../core/clock.js';
import type { RetryAttempt } from '../core/http/index.js';

export { platforms } from './apps/index.js';
export { developerErrorParser } from './errors.js';
export type { AccessLevel, AccessLevelList, AccessLevelsApi } from './access-levels.js';
export type { AppDetail, AppsApi, AppSummary, CreateAppInput, UpdateAppInput } from './apps/index.js';
export type { AuthApi, AuthUser, IssuedToken } from './auth/index.js';
export type {
    Action,
    ActionKind,
    AvailableFlow,
    CreateMigrationInput,
    Envelope,
    Issue,
    JsonSchema,
    Migration,
    MigrationApi,
    MigrationList,
    MigrationState,
    Progress,
    ResourceRef,
    Step,
    StepStatus,
    WaitOptions,
    WizardError,
} from './migrations/index.js';
export type { PageParams, Paginated, Pagination } from './pagination.js';

/** Exported because the adapter compares the resolved URL with it and warns when they differ. */
export const DEFAULT_ADAPTY_API_URL = 'https://api-admin.adapty.io/api/v1/developer';

/**
 * Narrower than HttpOptions on purpose: the transport seams (parseError, shouldRetry, the retry
 * policy, trailingSlash) are product knowledge, and two adapters overriding them would read the
 * same answers differently. What is left is what a consumer really owns.
 */
export type AdaptyOptions = {
    baseUrl?: string | undefined;
    clock?: Clock | undefined;
    fetch?: typeof globalThis.fetch | undefined;
    /** Whether a person is watching the caller, for the server's audit trail. */
    interactive?: boolean | undefined;
    onRetry?: ((info: RetryAttempt) => void) | undefined;
    signal?: AbortSignal | undefined;
    /** Without a token only auth is usable — that is how login builds the sdk. */
    token?: string | undefined;
    /** Comes from the adapter, so server logs can tell the CLI from an MCP server. */
    userAgent?: string | undefined;
};

export type Adapty = {
    accessLevels: AccessLevelsApi;
    apps: AppsApi;
    auth: AuthApi;
    migrations: MigrationApi;
};

/**
 * Who is calling, on every request of both clients: `User-Agent` says which program, section 3's
 * `X-Adapty-Interactive` says whether a person is watching it. Both are claims a client makes about
 * itself, so the server may log them and choose a format by them, never grant anything on them.
 */
const callerHeaders = (options: AdaptyOptions): Record<string, string> | undefined => {
    const headers: Record<string, string> = {};

    if (options.userAgent !== undefined) {
        headers['user-agent'] = options.userAgent;
    }

    // Sent as `false` too: "nobody was watching" is the half of the audit trail that matters.
    if (options.interactive !== undefined) {
        headers['x-adapty-interactive'] = String(options.interactive);
    }

    return Object.keys(headers).length === 0 ? undefined : headers;
};

/** The assembly point of the developer API: one transport, resources on top of it. */
export const createAdapty = (options: AdaptyOptions = {}): Adapty => {
    const transport = {
        baseUrl: options.baseUrl ?? DEFAULT_ADAPTY_API_URL,
        clock: options.clock,
        fetch: options.fetch,
        headers: callerHeaders(options),
        onRetry: options.onRetry,
        parseError: developerErrorParser,
        signal: options.signal,
        token: options.token,
    };

    const http = createHttp(transport);

    // Same host, same token, another service: /migrations is proxied through to the Wizard
    // Service, which is not Django and answers 404 to the trailing slash the rest of this API
    // requires. One client per convention, so neither resource has to remember the other's.
    const wizard = createHttp({ ...transport, trailingSlash: false });

    return {
        accessLevels: accessLevels(http),
        apps: apps(http),
        auth: auth(http),
        // The clock is a dependency here too, not only in the transport: `waitFor` sleeps
        // between polls, and a test must be able to do that instantly.
        migrations: migrations(wizard, options.clock ?? systemClock),
    };
};
