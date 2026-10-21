/**
 * What every operation of the resource shares: the answers as the server sends them. They pass
 * through exactly as they arrive, in snake_case — the tree is the dashboard's tree, so what
 * `--json` prints is what the dashboard metrics page reads.
 *
 * Which node kinds a tree has (placement, audience, variation, screen, product, period, segment,
 * flow …) depends on `based_on`, so a node is typed by what every kind has, not by its kind.
 */

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

/** One lifetime row of a `list`: the 27 metrics and the id of the entity. */
export type FlowMetricsRow = Metrics & { flow_id: string };
export type PlacementMetricsRow = Metrics & { placement_id: string };

export type FlowMetricsRows = {
    data: FlowMetricsRow[];
};

export type PlacementMetricsRows = {
    data: PlacementMetricsRow[];
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
