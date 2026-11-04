import { assertValid } from '../core/validation.js';

import { timezoneHeaders, toMetricsRequest, validateMetricsInput } from './metrics.js';

import type { FilterValues, MetricsInput, MetricsTree, PaywallMetricsTree, PlacementMetricsRows } from './metrics.js';
import type { Http } from '../core/http/index.js';

/**
 * The placements of an app. Only the metrics of flow and paywall placements are here: the other placement
 * operations still live in the old stack and move here when the topic is ported.
 *
 * Metrics are reads, though `get` is a POST: the body only describes the question. Like the other
 * analytics queries (`attribution report`) it is never retried: it is heavy, and a 429 (the routes
 * are rate limited per app) leaves the server's `Retry-After` on the error for the caller. What a
 * `get` takes lives in `metrics.ts`.
 *
 * The routes take the placement `type` as a query value and refuse one that does not match the
 * stored type; which types exist is the server's knowledge.
 */
export const placements = (http: Http) => ({
    metrics: {
        get: async (
            appId: string,
            placementId: string,
            type: string,
            input: MetricsInput,
        ): Promise<MetricsTree | PaywallMetricsTree> => {
            assertValid(validateMetricsInput(input));

            return http.post<MetricsTree | PaywallMetricsTree>(`/apps/${appId}/placements/${placementId}/metrics`, toMetricsRequest(input), {
                headers: timezoneHeaders(input.timezone),
                idempotent: false,
                query: { type },
            });
        },

        list: (appId: string, type: string, placementIds: readonly string[]) =>
            http.get<PlacementMetricsRows>(`/apps/${appId}/placements/metrics`, {
                query: { 'filter[placement_id]': placementIds.join(','), type },
            }),

        values: (appId: string, placementId: string, type: string) =>
            http.get<FilterValues>(`/apps/${appId}/placements/${placementId}/metrics/values`, { query: { type } }),
    },
});

export type PlacementsApi = ReturnType<typeof placements>;
