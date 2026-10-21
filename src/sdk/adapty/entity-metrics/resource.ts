import { assertValid } from '../../core/validation.js';

import { metricsHeaders, toMetricsRequest, validateMetricsInput } from './get.js';

import type { MetricsInput } from './get.js';
import type { FilterValues, FlowMetricsRows, MetricsTree, PlacementMetricsRows } from './model.js';
import type { Http } from '../../core/http/index.js';

/**
 * The metrics of one flow or one flow placement, read through the Developer API. Every path in one
 * place; what a `get` takes lives in `get.ts`.
 *
 * Reads, though three of them are POSTs: the body only describes the question. They are sent as
 * idempotent so a 429 (the routes are rate limited per app) is waited out and repeated.
 *
 * The placement routes take the placement `type` as a query value and refuse one that does not
 * match the stored type; which types exist is the server's knowledge.
 */
export const entityMetrics = (http: Http) => ({
    flows: {
        get: async (appId: string, flowId: string, input: MetricsInput): Promise<MetricsTree> => {
            assertValid(validateMetricsInput(input));

            return http.post<MetricsTree>(`/apps/${appId}/flows/${flowId}/metrics`, toMetricsRequest(input), {
                headers: metricsHeaders(input.timezone),
                idempotent: true,
            });
        },

        list: (appId: string, flowIds: readonly string[], timezone?: string) =>
            http.get<FlowMetricsRows>(`/apps/${appId}/flows/metrics`, {
                headers: metricsHeaders(timezone),
                query: { 'filter[flow_id]': flowIds.join(',') },
            }),

        values: (appId: string, flowId: string, timezone?: string) =>
            http.get<FilterValues>(`/apps/${appId}/flows/${flowId}/metrics/values`, {
                headers: metricsHeaders(timezone),
            }),
    },

    placements: {
        get: async (appId: string, placementId: string, type: string, input: MetricsInput): Promise<MetricsTree> => {
            assertValid(validateMetricsInput(input));

            return http.post<MetricsTree>(`/apps/${appId}/placements/${placementId}/metrics`, toMetricsRequest(input), {
                headers: metricsHeaders(input.timezone),
                idempotent: true,
                query: { type },
            });
        },

        list: (appId: string, type: string, placementIds: readonly string[], timezone?: string) =>
            http.get<PlacementMetricsRows>(`/apps/${appId}/placements/metrics`, {
                headers: metricsHeaders(timezone),
                query: { 'filter[placement_id]': placementIds.join(','), type },
            }),

        values: (appId: string, placementId: string, type: string, timezone?: string) =>
            http.get<FilterValues>(`/apps/${appId}/placements/${placementId}/metrics/values`, {
                headers: metricsHeaders(timezone),
                query: { type },
            }),
    },
});

export type EntityMetricsApi = ReturnType<typeof entityMetrics>;
