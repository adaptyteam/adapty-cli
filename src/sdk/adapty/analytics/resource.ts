import { assertValid } from '../../core/validation.js';

import { toChartRequest, validateChart } from './chart.js';
import { validateValues } from './values.js';

import type { ChartInput } from './chart.js';
import type { CatalogResponse, ChartResponse, ValuesResponse } from './model.js';
import type { Http } from '../../core/http/index.js';

/**
 * Every path of the analytics routes in one place. The catalog and the values are GETs and keep
 * the transport's retry. A chart is a POST that runs an analytics query: sent once, never retried,
 * so a busy server is not asked to run the same query again — the ApiError carries its
 * Retry-After for the caller to decide.
 *
 * The validating methods are async on purpose — a broken rule then arrives as a rejected promise,
 * like a network failure, and one await covers both.
 */
export const analytics = (http: Http) => ({
    catalog: (appId: string) => http.get<CatalogResponse>(`/apps/${appId}/analytics/catalog`),

    chart: async (input: ChartInput): Promise<ChartResponse> => {
        assertValid(validateChart(input));

        return http.post<ChartResponse>(`/apps/${input.appId}/analytics/metrics`, toChartRequest(input), { idempotent: false });
    },

    values: async (appId: string, dimension: string): Promise<ValuesResponse> => {
        assertValid(validateValues(dimension));

        return http.get<ValuesResponse>(`/apps/${appId}/analytics/values`, { query: { dimension } });
    },
});

export type AnalyticsApi = ReturnType<typeof analytics>;
