import { assertValid } from '../core/validation.js';

import { timezoneHeaders, toMetricsRequest, validateMetricsInput } from './metrics.js';

import type { FilterValues, FlowMetricsRows, MetricsInput, MetricsTree } from './metrics.js';
import type { Http } from '../core/http/index.js';

/**
 * The flows of an app. Only the metrics are here: the other flow operations still live in the old
 * stack and move here when the topic is ported.
 *
 * Metrics are reads, though `get` is a POST: the body only describes the question. Like the other
 * analytics queries (`attribution report`) it is never retried: it is heavy, and a 429 (the routes
 * are rate limited per app) leaves the server's `Retry-After` on the error for the caller. What a
 * `get` takes lives in `metrics.ts`.
 */
export const flows = (http: Http) => ({
    metrics: {
        get: async (appId: string, flowId: string, input: MetricsInput): Promise<MetricsTree> => {
            assertValid(validateMetricsInput(input));

            return http.post<MetricsTree>(`/apps/${appId}/flows/${flowId}/metrics`, toMetricsRequest(input), {
                headers: timezoneHeaders(input.timezone),
                idempotent: false,
            });
        },

        list: (appId: string, flowIds: readonly string[]) =>
            http.get<FlowMetricsRows>(`/apps/${appId}/flows/metrics`, { query: { 'filter[flow_id]': flowIds.join(',') } }),

        values: (appId: string, flowId: string) => http.get<FilterValues>(`/apps/${appId}/flows/${flowId}/metrics/values`),
    },
});

export type FlowsApi = ReturnType<typeof flows>;
