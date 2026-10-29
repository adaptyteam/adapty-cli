import type { AnalyticsFilter } from './analytics/query.js';
import type { Issue } from '../core/errors.js';

/**
 * What the metrics of a flow, a paywall and a placement share: the input of a `get`, its request
 * body, the one request header, and the answers as the server sends them. `flows.ts`,
 * `paywalls.ts` and `placements.ts` keep their own paths.
 *
 * The answers pass through exactly as they arrive, in snake_case — the tree is the dashboard's
 * tree, so what `--json` prints is what the dashboard metrics page reads.
 *
 * Which node kinds a tree has (placement, audience, variation, screen, product, period, segment,
 * flow …) depends on `based_on`, so a node is typed by what every kind has, not by its kind.
 *
 * A flow and a flow placement have 27 metrics on every node; a paywall and a paywall placement
 * have 21 (`PaywallMetrics`), and no node of their trees has a `level`.
 */

/**
 * What a `get` takes, for a flow, a paywall and a placement. The values are the server's words and
 * the server owns the lists (`based_on`, `period_unit`, `date_type`, `segmentation_by`), so none
 * is checked here: a wrong one comes back as a 400 that names the valid ones.
 *
 * Dates are inclusive days. There is no default `based_on` or `date_type`: the commands require
 * `basedOn` (and `dateType` on a flow and a paywall) as flags, and the server owns the rest of the
 * rules (a flow placement takes a day range only together with `dateType`; a paywall and a paywall
 * placement need a day range).
 */
export type MetricsInput = {
    basedOn?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    dateType?: string | undefined;
    /** Key (as `dimension`) and leaf values, as the `values` route lists them; a key given twice keeps all values. */
    filters?: readonly AnalyticsFilter[] | undefined;
    granularity?: string | undefined;
    /** Placements and paywalls only; `country` and `store` (and `product` for a paywall or a paywall placement). */
    groupBy?: string | undefined;
    /** IANA name, sent as `Adapty-Tz`. */
    timezone?: string | undefined;
};

type MetricsRequest = {
    based_on?: string;
    date_type?: string;
    filters?: Record<string, string[]>;
    period_unit?: string;
    segmentation_by?: string;
};

/** Only what is needed to build `filters.date`: a day range has two ends or none. */
export const validateMetricsInput = (input: MetricsInput): Issue[] => {
    const issues: Issue[] = [];

    if ((input.dateFrom === undefined) !== (input.dateTo === undefined)) {
        issues.push({
            message: 'give both ends of the period, or neither',
            path: input.dateFrom === undefined ? 'dateFrom' : 'dateTo',
        });
    }

    return issues;
};

/** Only the keys the caller set: the server's defaults stay the server's. */
export const toMetricsRequest = (input: MetricsInput): MetricsRequest => {
    const body: MetricsRequest = {};
    const filters: Record<string, string[]> = {};

    for (const { dimension, values } of input.filters ?? []) {
        (filters[dimension] ??= []).push(...values);
    }

    if (input.dateFrom !== undefined && input.dateTo !== undefined) {
        filters.date = [input.dateFrom, input.dateTo];
    }

    if (Object.keys(filters).length > 0) {
        body.filters = filters;
    }

    if (input.granularity !== undefined) {
        body.period_unit = input.granularity;
    }

    if (input.dateType !== undefined) {
        body.date_type = input.dateType;
    }

    if (input.basedOn !== undefined) {
        body.based_on = input.basedOn;
    }

    if (input.groupBy !== undefined) {
        body.segmentation_by = input.groupBy;
    }

    return body;
};

/** `Adapty-Tz` is the one request header of these routes, and only a `get` (the period points) uses it. */
export const timezoneHeaders = (timezone: string | undefined): Record<string, string> | undefined =>
    (timezone === undefined ? undefined : { 'adapty-tz': timezone });

/** The 27 metrics of every node and row, in the order the server sends them. */
type MetricName
    = | 'views'
        | 'unique_profiles_views'
        | 'total_completions'
        | 'total_uniq_completions'
        | 'from_start_conversion'
        | 'revenue'
        | 'proceeds'
        | 'net_revenue'
        | 'purchases'
        | 'trials'
        | 'unique_subscribers'
        | 'unique_paid_subscribers'
        | 'arppu'
        | 'arpu'
        | 'conversion_rate_purchases'
        | 'conversion_rate_trials'
        | 'trials_cancelled'
        | 'refunds'
        | 'arpas'
        | 'apppu'
        | 'appas'
        | 'conversion_rate_refunds'
        | 'conversion_rate_purchases_by_users'
        | 'conversion_rate_trials_by_users'
        | 'conversion_rate_trial_paid'
        | 'trials_finished'
        | 'trials_paid';

/** The same 27 numbers on every node and every row; "no data" is 0, never null. */
export type Metrics = Record<MetricName, number>;

/** One node of a tree, whatever its kind: the root, a split, a period point, a screen, a product. */
export type MetricsNode = Metrics & {
    /** Child nodes of the next level. */
    items?: MetricsNode[];
    /** Absent on the root of a flow tree. */
    level?: string;
    /** On `period` nodes only: an ISO timestamp. */
    period?: string;
    title?: string;
    /** The period points of this node, when the request asked for periods. */
    values?: MetricsNode[];
};

export type MetricsTree = {
    data: MetricsNode;
};

/**
 * The 21 metrics of every node and row of a paywall tree or a paywall list, in the order the
 * server sends them. `in_current_state` is a flag, the rest are numbers; "no data" is 0, never null.
 */
type PaywallMetricName
    = | 'revenue'
        | 'proceeds'
        | 'net_revenue'
        | 'purchases'
        | 'trials'
        | 'trials_cancelled'
        | 'refunds'
        | 'unique_subscribers'
        | 'unique_paid_subscribers'
        | 'views'
        | 'unique_profiles_views'
        | 'arppu'
        | 'arpas'
        | 'apppu'
        | 'appas'
        | 'conversion_rate_purchases'
        | 'conversion_rate_trials'
        | 'conversion_rate_refunds'
        | 'conversion_rate_purchases_by_users'
        | 'conversion_rate_trials_by_users';

export type PaywallMetrics = Record<PaywallMetricName, number> & { in_current_state: boolean };

/**
 * One node of a paywall or paywall placement tree, whatever its kind (placement, audience, paywall,
 * A/B test, arm, product, segment, period …). The root is the Total row with `title: "Total"`, and
 * its children are in `items`.
 */
export type PaywallMetricsNode = PaywallMetrics & {
    content_type?: string;
    items?: PaywallMetricsNode[];
    /** On `period` nodes only: an ISO timestamp. */
    period?: string;
    title?: string | null;
    /** The period points of this node, when the request asked for periods. */
    values?: PaywallMetricsNode[];
};

export type PaywallMetricsTree = {
    data: PaywallMetricsNode;
};

/** One lifetime row of a paywall `list`: the 21 metrics, the id and the last purchase (null with none). */
export type PaywallMetricsRow = PaywallMetrics & { last_purchases: string | null; paywall_id: string };

export type PaywallMetricsRows = {
    data: PaywallMetricsRow[];
};

/** One lifetime row of a paywall placement `list`: the metrics without the views and their rates. */
export type PaywallPlacementMetricsRow = Omit<
    PaywallMetrics,
    'conversion_rate_purchases' | 'conversion_rate_purchases_by_users' | 'conversion_rate_trials' | 'conversion_rate_trials_by_users'
    | 'unique_profiles_views' | 'views'
> & { placement_id: string };

/** One lifetime row of a `list`: the 27 metrics and the id of the entity. */
export type FlowMetricsRow = Metrics & { flow_id: string };
export type PlacementMetricsRow = Metrics & { placement_id: string };

export type FlowMetricsRows = {
    data: FlowMetricsRow[];
};

export type PlacementMetricsRows = {
    data: (PaywallPlacementMetricsRow | PlacementMetricsRow)[];
};

/** `value` of a top node is the filter key; the leaves are what a filter takes. */
export type FilterValueNode = {
    children?: FilterValueNode[];
    label: string;
    value: string;
};

export type FilterValues = {
    data: FilterValueNode[];
    meta: null;
};
