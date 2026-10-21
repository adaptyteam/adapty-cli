import { assertValid } from '../../core/validation.js';

import { toMetricsRequest, validateMetricsInput } from './get.js';

import type { MetricsInput } from './get.js';
import type { FilterValues, FlowMetricsRows, MetricsTree, PlacementMetricsRows } from './model.js';
import type { Http } from '../../core/http/index.js';

/** `Adapty-Tz` is the one request header of these routes, and only a `get` (the period points) uses it. */
const timezoneHeaders = (timezone: string | undefined): Record<string, string> | undefined =>
    (timezone === undefined ? undefined : { 'adapty-tz': timezone });

/**
 * The metrics of one flow or one flow placement, read through the Developer API. Every path in one
 * place; what a `get` takes lives in `get.ts`.
 *
 * Reads, though two of them are POSTs: the body only describes the question. Like the other
 * analytics queries (`attribution report`) the POSTs are never retried: they are heavy, and a 429
 * (the routes are rate limited per app) leaves the server's `Retry-After` on the error for the caller.
 *
 * The placement routes take the placement `type` as a query value and refuse one that does not
 * match the stored type; which types exist is the server's knowledge.
 */
export const entityMetrics = (http: Http) => ({
    flows: {
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

    placements: {
        get: async (appId: string, placementId: string, type: string, input: MetricsInput): Promise<MetricsTree> => {
            assertValid(validateMetricsInput(input));

            return http.post<MetricsTree>(`/apps/${appId}/placements/${placementId}/metrics`, toMetricsRequest(input), {
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

export type EntityMetricsApi = ReturnType<typeof entityMetrics>;
