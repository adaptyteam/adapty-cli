import { assertValid } from '../../core/validation.js';
import { timezoneHeaders, toMetricsRequest, validateMetricsInput } from '../metrics.js';

import type { Http } from '../../core/http/index.js';
import type { FilterValues, Metrics, MetricsInput } from '../metrics.js';

/**
 * The metrics of A/B tests, as the dashboard shows them on the test list and the results page. The
 * answers pass through as they arrive, in snake_case. Paywall and flow tests answer in different
 * shapes, and the routes take the test `type` as a query value and refuse one that does not match
 * the stored type, so a node is typed by what the views read, not by its kind.
 *
 * `get` is a POST that only describes the question: like the other analytics queries it is never
 * retried, and a 429 leaves the server's `Retry-After` on the error. What a `get` takes lives in
 * `../metrics.ts`.
 */

/**
 * A node of any kind (test, arm, period, product, screen). Only an arm has `weight`, `probability`
 * (P2BB, percent) and the 99 % range of revenue per 1,000 viewers; `p_value` is a flow test's.
 */
export type AbMetricsNode = Partial<Metrics> & {
    average_per_1000?: number;
    flow_id?: string;
    in_current_state?: boolean;
    items?: AbMetricsNode[];
    level?: string;
    low_boundary?: number;
    p_value?: null | number;
    paywall?: { paywall_id: string; title: null | string };
    paywall_id?: string;
    period?: string;
    probability?: number;
    product_id?: string;
    screen_id?: string;
    title?: null | string;
    upper_boundary?: number;
    values?: AbMetricsNode[];
    variation_id?: string;
    weight?: number;
};

export type AbTestRef = {
    ab_test_id: string;
    title: string;
};

/** One test of a list: its own numbers (never a sum of the arms) and its arms. */
export type AbTestMetricsRow = AbMetricsNode & { ab_test_id: string };

export type AbTestMetricsRows = {
    data: AbTestMetricsRow[];
};

/** A paywall test has `metrics` (the arms) and its `ab_test`; a flow test a tree whose first level is the arms. */
export type AbTestMetricsDetail = {
    data: AbMetricsNode & {
        ab_test?: AbTestRef;
        metrics?: AbMetricsNode[];
        started_at?: null | string;
        state?: string;
    };
};

export type AbTestMetricsTotal = {
    data: {
        ab_test: AbTestRef;
        metrics: AbMetricsNode[];
        started_at: null | string;
        state: string;
        stopped_at: null | string;
    };
};

export const abTestMetrics = (http: Http, base: (appId: string) => string) => ({
    get: async (
        appId: string,
        abTestId: string,
        type: string,
        input: MetricsInput,
    ): Promise<AbTestMetricsDetail> => {
        assertValid(validateMetricsInput(input));

        return http.post<AbTestMetricsDetail>(`${base(appId)}/${abTestId}/metrics`, toMetricsRequest(input), {
            headers: timezoneHeaders(input.timezone),
            idempotent: false,
            query: { type },
        });
    },

    list: (appId: string, type: string, abTestIds: readonly string[]) =>
        http.get<AbTestMetricsRows>(`${base(appId)}/metrics`, {
            query: { 'filter[ab_test_id]': abTestIds.join(','), type },
        }),

    total: (appId: string, abTestId: string, type: string) =>
        http.get<AbTestMetricsTotal>(`${base(appId)}/${abTestId}/metrics/total`, { query: { type } }),

    values: (appId: string, abTestId: string, type: string) =>
        http.get<FilterValues>(`${base(appId)}/${abTestId}/metrics/values`, { query: { type } }),
});
