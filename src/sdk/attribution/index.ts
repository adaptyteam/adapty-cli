import { ApiError } from '../core/errors.js';
import { createHttp, defaultRetryPolicy, defaultShouldRetry } from '../core/http/index.js';

import { attributionErrorParser } from './errors.js';
import { attribution } from './resource.js';

import type { AttributionApi } from './resource.js';
import type { Clock } from '../core/clock.js';
import type { RetryAttempt, ShouldRetry } from '../core/http/index.js';

export { attributionErrorParser } from './errors.js';
export { granularities, ISO_DATE, reportGroupBy, revenueBases, sortDirections, validateReport } from './report.js';
export { validateValues } from './values.js';
export type {
    Dimension,
    DimensionCatalog,
    DimensionIdentity,
    Metric,
    MetricCatalog,
    MetricUnit,
    ReportLimits,
} from './catalog.js';
export type {
    Granularity,
    ReportData,
    ReportFilter,
    ReportGroupBy,
    ReportInput,
    ReportMeta,
    ReportRow,
    ReportSort,
    RevenueBasis,
    SortDirection,
} from './report.js';
export type {
    AttributionApi,
    AttributionResponse,
    DimensionsResponse,
    MetricsResponse,
    ReportResponse,
    ValuesResponse,
} from './resource.js';
export type { ValuesData, ValuesInput, ValuesItemById, ValuesItemByValue, ValuesMeta } from './values.js';

/** Exported because the adapter compares the resolved URL with it and warns when they differ. */
export const DEFAULT_ATTRIBUTION_API_URL = 'https://api-ua.adapty.io/api/v1/cli';

/**
 * Narrower than HttpOptions on purpose, like AdaptyOptions: the error parser, the retry rule and
 * the path style are product knowledge, not something an adapter should override.
 */
export type AttributionOptions = {
    baseUrl?: string | undefined;
    clock?: Clock | undefined;
    fetch?: typeof globalThis.fetch | undefined;
    onRetry?: ((info: RetryAttempt) => void) | undefined;
    signal?: AbortSignal | undefined;
    /** The Adapty developer token: the same bearer, no app header. */
    token?: string | undefined;
    /** Comes from the adapter, so server logs can tell the CLI from an MCP server. */
    userAgent?: string | undefined;
};

export type Attribution = AttributionApi;

/**
 * The server's Retry-After is honoured only up to the transport's longest backoff. A longer wait
 * (60 s while Core is down) surfaces at once as an error carrying the delay, instead of a silent sleep.
 */
const shouldRetry: ShouldRetry = (error, attempt) =>
    (error instanceof ApiError && (error.retryAfterMs ?? 0) > defaultRetryPolicy.maxDelayMs
        ? false
        : defaultShouldRetry(error, attempt));

/** The assembly point of the attribution backend: one transport, the endpoints on top of it. */
export const createAttribution = (options: AttributionOptions = {}): Attribution => {
    const http = createHttp({
        baseUrl: options.baseUrl ?? DEFAULT_ATTRIBUTION_API_URL,
        clock: options.clock,
        fetch: options.fetch,
        headers: options.userAgent === undefined ? undefined : { 'user-agent': options.userAgent },
        onRetry: options.onRetry,
        parseError: attributionErrorParser,
        shouldRetry,
        signal: options.signal,
        token: options.token,
        // The backend routes are FastAPI paths without a trailing slash, unlike the developer API
        trailingSlash: false,
    });

    return attribution(http);
};
