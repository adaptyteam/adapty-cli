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

export type MetricCatalog = {
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
