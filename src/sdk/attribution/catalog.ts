/**
 * The vocabulary the backend describes itself with: which metrics a report can ask for and which
 * dimensions it can group or filter by. Read-only and not scoped to an app, so the catalog is what
 * an agent reads before it builds a report. Passed through as the server sends it, in snake_case.
 */

export type MetricUnit = 'count' | 'per_mille' | 'percent' | 'usd';

export type Metric = {
    /** Whether the totals row may sum this metric across groups. */
    additive: boolean;
    /** The metrics a ratio is computed from; null for a plain metric. */
    denominator: null | string[];
    description: string;
    example: null | string;
    family: string;
    label: string;
    name: string;
    /** A name template for a family of metrics (e.g. a day horizon); null for a fixed name. */
    pattern: null | string;
    spend_based: boolean;
    unit: MetricUnit;
};

/** The caps a report is held to, so a request can be sized before it is sent rather than refused. */
export type ReportLimits = {
    max_filter_values: number;
    max_keyword_length: number;
    max_metrics: number;
    max_prediction_day: number;
    max_prediction_horizons: number;
    max_prediction_non_date_dimensions: number;
    max_rows: number;
    /** The widest period in days, both ends counted: per date granularity, and `no_date_grouping`. */
    max_window_days: Record<string, number>;
};

export type MetricCatalog = {
    limits: ReportLimits;
    metrics: Metric[];
};

/** id: items are entities with an id, a name and a channel. value: items are bare values. */
export type DimensionIdentity = 'id' | 'value';

export type Dimension = {
    filterable: boolean;
    /** The granularities a date grouping accepts; null for every other dimension. */
    granularities: null | string[];
    groupable: boolean;
    identity: DimensionIdentity;
    label: string;
    name: string;
};

export type DimensionCatalog = {
    dimensions: Dimension[];
};
