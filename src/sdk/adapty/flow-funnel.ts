import type { AnalyticsFilter } from './analytics/query.js';

/**
 * The screen funnel of a flow: the input of a `get`, its request body, and the answer as the
 * server sends it. `flows.ts` keeps the paths; the time zone header comes from `metrics.ts`, as
 * the funnel and the metrics routes read it the same way.
 *
 * The answer passes through exactly as it arrives, in snake_case — it is the dashboard's Funnel
 * tab, so what `--json` prints is what the tab reads. A rate is a percent with 2 decimals and
 * `null` where it does not apply; `null` is never 0.
 */

/**
 * What a `get` takes. The server owns the values (`date_type`, the filter keys and values), so none
 * is checked here. There is no `based_on`, no granularity and no compared period: the funnel has
 * neither.
 */
export type FlowFunnelInput = {
    /** First day of the period, inclusive. */
    dateFrom: string;
    /** Last day of the period, inclusive. */
    dateTo: string;
    dateType: string;
    /** Key (as `dimension`) and values, as `values` lists them; a key given twice keeps all values. */
    filters?: readonly AnalyticsFilter[] | undefined;
    /** Without one, the server reads the published version. */
    flowVersionId?: string | undefined;
    /** IANA name, sent as `Adapty-Tz`. */
    timezone?: string | undefined;
};

type FlowFunnelRequest = {
    date_type: string;
    filters: Record<string, string[]>;
    flow_version_id?: string;
};

export const toFlowFunnelRequest = (input: FlowFunnelInput): FlowFunnelRequest => {
    const filters: Record<string, string[]> = {};

    for (const { dimension, values } of input.filters ?? []) {
        (filters[dimension] ??= []).push(...values);
    }

    filters.date = [input.dateFrom, input.dateTo];

    const body: FlowFunnelRequest = { date_type: input.dateType, filters };

    if (input.flowVersionId !== undefined) {
        body.flow_version_id = input.flowVersionId;
    }

    return body;
};

export type FlowFunnelSummary = {
    completed: number;
    completion_rate: null | number;
    dropped: number;
    drop_rate: null | number;
    entered: number;
    /** Can be above the sum of the steps: it adds purchases of entered users off their counted path. */
    revenue: null | number;
};

export type FlowFunnelScreen = {
    /** Users who finished the flow on this screen. */
    completed: number;
    completed_share_of_step: null | number;
    completion_rate: null | number;
    /** `null` only on a screen that is the last one for everyone who reached it. */
    drop_off: null | number;
    drop_off_rate: null | number;
    drop_off_share_of_step: null | number;
    is_last_screen: boolean;
    paywall_ids: string[];
    purchases: null | number;
    reached: number;
    revenue: null | number;
    screen_id: string;
    screen_type: string;
    share_of_step: null | number;
    title: string;
    trials: null | number;
};

export type FlowFunnelStep = {
    completed: number;
    completion_rate: null | number;
    /** `null` on step 1. */
    conversion_from_previous: null | number;
    drop_off: null | number;
    drop_off_rate: null | number;
    has_paywall: boolean;
    purchases: null | number;
    reached: number;
    reached_rate: null | number;
    revenue: null | number;
    /** Sorted by `reached`, at least one. */
    screens: FlowFunnelScreen[];
    step_order: number;
    trials: null | number;
};

/** A screen of the version in builder order; the funnel of a period without users lists these. */
export type FlowFunnelVersionScreen = Pick<FlowFunnelScreen, 'paywall_ids' | 'screen_id' | 'screen_type' | 'title'>;

export type FlowFunnel = {
    flow_id: string;
    /** The version the funnel is for, also when the request named none. */
    flow_version_id: string;
    steps: FlowFunnelStep[];
    summary: FlowFunnelSummary;
    version: number;
    version_screens: FlowFunnelVersionScreen[];
};

export type FlowFunnelAnswer = {
    data: FlowFunnel;
    meta: null;
};
