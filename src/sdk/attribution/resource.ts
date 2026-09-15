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
    dimensions: () => http.get<DimensionsResponse>('/dimensions'),
    metrics: () => http.get<MetricsResponse>('/metrics'),

    report: async (input: ReportInput): Promise<ReportResponse> => {
        assertValid(validateReport(input));

        return http.post<ReportResponse>('/report', toReportRequest(input), { idempotent: false });
    },

    values: async (input: ValuesInput): Promise<ValuesResponse> => {
        assertValid(validateValues(input));

        return http.post<ValuesResponse>('/values', toValuesRequest(input), { idempotent: false });
    },
});

export type AttributionApi = ReturnType<typeof attribution>;
