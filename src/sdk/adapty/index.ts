import { createHttp } from '../core/http/index.js';

import { accessLevels } from './access-levels.js';
import { apps } from './apps/index.js';
import { auth } from './auth/index.js';
import { developerErrorParser } from './errors.js';

import type { AccessLevelsApi } from './access-levels.js';
import type { AppsApi } from './apps/index.js';
import type { AuthApi } from './auth/index.js';
import type { Clock } from '../core/clock.js';
import type { RetryAttempt } from '../core/http/index.js';

export { platforms } from './apps/index.js';
export { developerErrorParser } from './errors.js';
export type { AccessLevel, AccessLevelList, AccessLevelsApi } from './access-levels.js';
export type { AppDetail, AppsApi, AppSummary, CreateAppInput, UpdateAppInput } from './apps/index.js';
export type { AuthApi, AuthUser, IssuedToken } from './auth/index.js';
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
};

/** The assembly point of the developer API: one transport, resources on top of it. */
export const createAdapty = (options: AdaptyOptions = {}): Adapty => {
    const http = createHttp({
        baseUrl: options.baseUrl ?? DEFAULT_ADAPTY_API_URL,
        clock: options.clock,
        fetch: options.fetch,
        headers: options.userAgent === undefined ? undefined : { 'user-agent': options.userAgent },
        onRetry: options.onRetry,
        parseError: developerErrorParser,
        signal: options.signal,
        token: options.token,
    });

    return {
        accessLevels: accessLevels(http),
        apps: apps(http),
        auth: auth(http),
    };
};
