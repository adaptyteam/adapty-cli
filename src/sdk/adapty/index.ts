import { systemClock } from '../core/clock.js';
import { createHttp } from '../core/http/index.js';

import { abTests } from './ab-tests/index.js';
import { accessLevels } from './access-levels.js';
import { analytics } from './analytics/index.js';
import { apps } from './apps/index.js';
import { auth } from './auth/index.js';
import { developerErrorParser } from './errors.js';
import { feedback } from './feedback/index.js';
import { flows } from './flows.js';
import { migrations } from './migrations/index.js';
import { placements } from './placements.js';
import { productOffers } from './product-offers/index.js';

import type { AbTestsApi } from './ab-tests/index.js';
import type { AccessLevelsApi } from './access-levels.js';
import type { AnalyticsApi } from './analytics/index.js';
import type { AppsApi } from './apps/index.js';
import type { AuthApi } from './auth/index.js';
import type { FeedbackApi } from './feedback/index.js';
import type { FlowsApi } from './flows.js';
import type { MigrationApi } from './migrations/index.js';
import type { PlacementsApi } from './placements.js';
import type { ProductOffersApi } from './product-offers/index.js';
import type { Clock } from '../core/clock.js';
import type { RetryAttempt } from '../core/http/index.js';

export { abTestStates, abTestTypes, stopContent } from './ab-tests/index.js';
export {
    periodTypes,
    periodUnits,
    revenueBases,
    validateChart,
    validateCohort,
    validateConversion,
    validateFilterValues,
    validateFunnel,
    validateLtv,
    validateRetention,
} from './analytics/index.js';
export { platforms } from './apps/index.js';
export { offerTypes } from './product-offers/index.js';
export { developerErrorParser } from './errors.js';
export { sentiments } from './feedback/index.js';
export { validateMetricsInput } from './metrics.js';
export type {
    AbTestDetail,
    AbTestsApi,
    AbTestSummary,
    AbTestType,
    AbTestWriteInput,
    FlowArm,
    FlowArmView,
    ListAbTestsParams,
    PaywallArm,
    PaywallArmView,
    StartAbTestInput,
    StopAbTestInput,
} from './ab-tests/index.js';
export type { AccessLevel, AccessLevelList, AccessLevelsApi } from './access-levels.js';
export type {
    AnalyticsFilter,
    AnalyticsSegment,
    CatalogChart,
    CatalogOperation,
    CatalogOption,
    CatalogResponse,
    CatalogSegmentation,
    ChartInput,
    ChartResponse,
    CohortInput,
    CohortResponse,
    ConversionInput,
    ConversionResponse,
    FilterValue,
    FilterValuesInput,
    FilterValuesResponse,
    FunnelInput,
    FunnelResponse,
    LtvInput,
    LtvResponse,
    PeriodUnit,
    RetentionInput,
    RetentionResponse,
} from './analytics/index.js';
export type { AppDetail, AppsApi, AppSummary, CreateAppInput, UpdateAppInput } from './apps/index.js';
export type { AuthApi, AuthUser, IssuedToken } from './auth/index.js';
export type { FeedbackApi, SendFeedbackInput, Sentiment } from './feedback/index.js';
export type { FlowsApi } from './flows.js';
export type {
    FilterValueNode,
    FilterValues,
    FlowMetricsRows,
    Metrics,
    MetricsInput,
    MetricsNode,
    MetricsTree,
    PlacementMetricsRows,
} from './metrics.js';
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
export type {
    CreateProductOfferInput,
    OfferType,
    ProductOffer,
    ProductOffersApi,
    StoreOffer,
    UpdateProductOfferInput,
} from './product-offers/index.js';
export type { PageParams, Paginated, Pagination } from './pagination.js';
export type { PlacementsApi } from './placements.js';

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
    abTests: AbTestsApi;
    accessLevels: AccessLevelsApi;
    analytics: AnalyticsApi;
    apps: AppsApi;
    auth: AuthApi;
    feedback: FeedbackApi;
    flows: FlowsApi;
    migrations: MigrationApi;
    placements: PlacementsApi;
    productOffers: ProductOffersApi;
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
        abTests: abTests(http),
        accessLevels: accessLevels(http),
        analytics: analytics(http),
        apps: apps(http),
        auth: auth(http),
        feedback: feedback(http),
        flows: flows(http),
        // The clock is a dependency here too, not only in the transport: `waitFor` sleeps
        // between polls, and a test must be able to do that instantly.
        migrations: migrations(wizard, options.clock ?? systemClock),
        placements: placements(http),
        productOffers: productOffers(http),
    };
};
