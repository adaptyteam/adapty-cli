import { ApiError } from '../../core/errors.js';
import { assertValid } from '../../core/validation.js';

import { toChartRequest, validateChart } from './chart.js';
import { toCohortRequest, validateCohort } from './cohort.js';
import { toConversionRequest, validateConversion } from './conversion.js';
import { toFunnelRequest, validateFunnel } from './funnel.js';
import { toLtvRequest, validateLtv } from './ltv.js';
import { toRetentionRequest, validateRetention } from './retention.js';
import { validateFilterValues } from './values.js';

import type { CatalogResponse } from './catalog.js';
import type { ChartInput, ChartResponse } from './chart.js';
import type { CohortInput, CohortResponse } from './cohort.js';
import type { ConversionInput, ConversionResponse } from './conversion.js';
import type { FunnelInput, FunnelResponse } from './funnel.js';
import type { LtvInput, LtvResponse } from './ltv.js';
import type { RetentionInput, RetentionResponse } from './retention.js';
import type { FilterValuesInput, FilterValuesResponse } from './values.js';
import type { Http } from '../../core/http/index.js';

const base = (appId: string): string => `/apps/${appId}/analytics`;

const isObject = (value: unknown): boolean => typeof value === 'object' && value !== null;

const dataOf = (body: unknown): unknown => (isObject(body) ? (body as { data?: unknown }).data : undefined);

/** A data answer: `data.segments` is the list every view reads. */
const hasSegments = (data: unknown): boolean =>
    isObject(data) && Array.isArray((data as { segments?: unknown }).segments);

/**
 * The transport hands back whatever a success body parsed to, and a proxy's HTML page parses to a string.
 * Passed on, it would reach the views and exit 0 under --json, so a success without the `{ data }` envelope is
 * an error, as in the attribution resource.
 */
const envelope = async <T>(pending: Promise<unknown>, isData: (data: unknown) => boolean = isObject): Promise<T> => {
    const body = await pending;

    if (!isData(dataOf(body))) {
        throw new ApiError({
            code: 'malformed_response',
            details: body,
            message: 'The Developer API answered with a success status but not with its response envelope, '
                + 'so the answer was cut short or came from something in between. Nothing was read.',
            status: 200,
        });
    }

    return body as T;
};

/**
 * Every path of the analytics of an app in one place. The catalog and the values are GETs and keep the
 * transport's retry. The six operations are POSTs that run analytics queries under the rate limits of each route
 * (2 requests per second per app and 360 per minute for all callers together, as the Export API): sent once,
 * never retried, and a 429 reaches the caller with the server's wait.
 *
 * The validating methods are async on purpose — a broken rule then arrives as a rejected promise, like a
 * network failure, and one await covers both.
 */
export const analytics = (http: Http) => ({
    catalog: (appId: string) => envelope<CatalogResponse>(http.get(`${base(appId)}/catalog`)),

    chart: async (input: ChartInput): Promise<ChartResponse> => {
        assertValid(validateChart(input));

        return envelope(http.post(`${base(input.appId)}/metrics`, toChartRequest(input), { idempotent: false }), hasSegments);
    },

    cohort: async (input: CohortInput): Promise<CohortResponse> => {
        assertValid(validateCohort(input));

        return envelope(http.post(`${base(input.appId)}/cohort`, toCohortRequest(input), { idempotent: false }), hasSegments);
    },

    conversion: async (input: ConversionInput): Promise<ConversionResponse> => {
        assertValid(validateConversion(input));

        return envelope(http.post(`${base(input.appId)}/conversion`, toConversionRequest(input), { idempotent: false }), hasSegments);
    },

    funnel: async (input: FunnelInput): Promise<FunnelResponse> => {
        assertValid(validateFunnel(input));

        return envelope(http.post(`${base(input.appId)}/funnel`, toFunnelRequest(input), { idempotent: false }), hasSegments);
    },

    ltv: async (input: LtvInput): Promise<LtvResponse> => {
        assertValid(validateLtv(input));

        return envelope(http.post(`${base(input.appId)}/ltv`, toLtvRequest(input), { idempotent: false }), hasSegments);
    },

    retention: async (input: RetentionInput): Promise<RetentionResponse> => {
        assertValid(validateRetention(input));

        return envelope(http.post(`${base(input.appId)}/retention`, toRetentionRequest(input), { idempotent: false }), hasSegments);
    },

    values: async (input: FilterValuesInput): Promise<FilterValuesResponse> => {
        assertValid(validateFilterValues(input));

        return envelope(http.get(`${base(input.appId)}/values`, { query: { dimension: input.dimension } }));
    },
});

export type AnalyticsApi = ReturnType<typeof analytics>;
