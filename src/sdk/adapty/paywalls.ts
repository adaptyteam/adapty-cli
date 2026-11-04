import { assertValid } from '../core/validation.js';

import { timezoneHeaders, toMetricsRequest, validateMetricsInput } from './metrics.js';

import type { FilterValues, MetricsInput, PaywallMetricsRows, PaywallMetricsTree } from './metrics.js';
import type { Http } from '../core/http/index.js';

/**
 * The paywalls of an app. Only the metrics are here: the other paywall operations still live in
 * the old stack and move here when the topic is ported.
 *
 * Metrics are reads, though `get` is a POST: the body only describes the question. Like the other
 * analytics queries (`attribution report`) it is never retried: it is heavy, and a 429 (the routes
 * are rate limited per app) leaves the server's `Retry-After` on the error for the caller. What a
 * `get` takes lives in `metrics.ts`.
 */
export const paywalls = (http: Http) => ({
    metrics: {
        get: async (appId: string, paywallId: string, input: MetricsInput): Promise<PaywallMetricsTree> => {
            assertValid(validateMetricsInput(input));

            return http.post<PaywallMetricsTree>(`/apps/${appId}/paywalls/${paywallId}/metrics`, toMetricsRequest(input), {
                headers: timezoneHeaders(input.timezone),
                idempotent: false,
            });
        },

        list: (appId: string, paywallIds: readonly string[]) =>
            http.get<PaywallMetricsRows>(`/apps/${appId}/paywalls/metrics`, { query: { 'filter[paywall_id]': paywallIds.join(',') } }),

        values: (appId: string, paywallId: string) => http.get<FilterValues>(`/apps/${appId}/paywalls/${paywallId}/metrics/values`),
    },
});

export type PaywallsApi = ReturnType<typeof paywalls>;
