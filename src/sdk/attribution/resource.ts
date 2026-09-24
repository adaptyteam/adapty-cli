import { ApiError } from '../core/errors.js';
import { assertValid } from '../core/validation.js';

import { toReportRequest, validateReport } from './report.js';
import { toValuesRequest, validateValues } from './values.js';

import type { DimensionCatalog, MetricCatalog } from './catalog.js';
import type { ReportData, ReportInput, ReportMeta } from './report.js';
import type { ValuesData, ValuesInput, ValuesMeta } from './values.js';
import type { Http } from '../core/http/index.js';

/** Every success of this service, passed through unchanged: that object is what --json prints. */
export type AttributionResponse<Data, Meta> = {
    data: Data;
    meta: Meta;
    success: true;
};

export type MetricsResponse = AttributionResponse<MetricCatalog, null>;
export type DimensionsResponse = AttributionResponse<DimensionCatalog, null>;
export type ReportResponse = AttributionResponse<ReportData, ReportMeta>;
export type ValuesResponse = AttributionResponse<ValuesData, ValuesMeta>;

const isEnvelope = (body: unknown): boolean => {
    if (typeof body !== 'object' || body === null) {
        return false;
    }

    const { data, success } = body as { data?: unknown; success?: unknown };

    return success === true && typeof data === 'object' && data !== null;
};

/**
 * The transport hands back whatever a success body parsed to, and a proxy's HTML page parses to a
 * string. Passed on, it would print under --json and exit 0, so a success without this service's
 * envelope is an error: the counterpart of the legacy client's `malformed_response`.
 */
const envelope = async <T>(pending: Promise<unknown>): Promise<T> => {
    const body = await pending;

    if (!isEnvelope(body)) {
        throw new ApiError({
            code: 'malformed_response',
            details: body,
            message: 'The attribution service answered with a success status but not with its response envelope, '
                + 'so the answer was cut short or came from something in between. Nothing was read.',
            // The transport keeps the status of an error only, and this service answers every success with 200
            status: 200,
        });
    }

    return body as T;
};

/**
 * Every path of the attribution backend in one place. The catalog reads are GETs and keep the
 * transport's retry. Report and values are POSTs that run analytics queries: sent once, never
 * retried, so a busy or unavailable backend is not asked to run the same expensive query again —
 * the ApiError carries the server's Retry-After for the caller to decide.
 *
 * The validating methods are async on purpose — a broken rule then arrives as a rejected promise,
 * like a network failure, and one await covers both.
 */
export const attribution = (http: Http) => ({
    dimensions: () => envelope<DimensionsResponse>(http.get('/dimensions')),
    metrics: () => envelope<MetricsResponse>(http.get('/metrics')),

    report: async (input: ReportInput): Promise<ReportResponse> => {
        assertValid(validateReport(input));

        return envelope(http.post('/report', toReportRequest(input), { idempotent: false }));
    },

    values: async (input: ValuesInput): Promise<ValuesResponse> => {
        assertValid(validateValues(input));

        return envelope(http.post('/values', toValuesRequest(input), { idempotent: false }));
    },
});

export type AttributionApi = ReturnType<typeof attribution>;
