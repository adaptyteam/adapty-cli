/**
 * The analytics vocabulary and the answers of its three routes, typed by hand from the Developer
 * API contract and passed through as the server sends them, in snake_case: that is what --json
 * prints. Which charts, dimensions and values exist is the server's knowledge (`catalog`, `values`).
 */

/** In the order the server documents them, so `--granularity` reads the same way. */
export const periodUnits = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type PeriodUnit = (typeof periodUnits)[number];

export const revenueBases = ['gross', 'proceeds', 'net'] as const;
export type RevenueBasis = (typeof revenueBases)[number];

/** One period of a segment: `date` is the period start, `YYYY-MM-DD`. */
export type ChartPoint = {
    date: string;
    value: null | number;
};

export type ChartSegment = {
    is_total: boolean;
    /** The raw value a `--filter` on the segmentation takes; null for the total, or when the server has none. */
    key: null | string;
    title: string;
    value: null | number;
    values: ChartPoint[];
};

export type ChartData = {
    chart_id: string;
    /** The total first, then the rest in the server's order. */
    segments: ChartSegment[];
    title: string;
    /** Left out by the server when the chart has no unit mapping. */
    unit?: string | undefined;
    value: null | number;
};

/** The query as the server resolved it: defaults and the timezone filled in. */
export type ChartQuery = {
    chart_id: string;
    /** Every filter as a list, `date` as `[from, to]` among them. */
    filters: Record<string, string[]>;
    period_unit: PeriodUnit;
    revenue_basis?: RevenueBasis | undefined;
    segmentation?: null | string | undefined;
    timezone: string;
};

export type ChartMeta = {
    /** Plain-text definitions: of `value` for this chart and basis, of the segmentation, of freshness. */
    definitions: Record<string, string>;
    query: ChartQuery;
};

export type ChartResponse = {
    data: ChartData;
    meta: ChartMeta;
};

export type CatalogChart = {
    chart_id: string;
    /** The dimensions a chart accepts as a filter. */
    filters: string[];
    /** Whether the chart takes a revenue basis. */
    revenue_basis: boolean;
    /** The dimensions a chart can be broken down by. */
    segmentations: string[];
    title: string;
    unit?: string | undefined;
};

export type CatalogDimension = {
    filter: boolean;
    key: string;
    segmentation: boolean;
    title: string;
};

export type Catalog = {
    charts: CatalogChart[];
    dimensions: CatalogDimension[];
    period_units: string[];
    revenue_bases: string[];
};

export type CatalogResponse = {
    data: Catalog;
};

export type DimensionValue = {
    /** The parent label when the server groups the values (countries by region). */
    group?: string | undefined;
    label: string;
    /** What a `--filter` takes. */
    value: string;
};

export type ValuesResponse = {
    data: DimensionValue[];
};
