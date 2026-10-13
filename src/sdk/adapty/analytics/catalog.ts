/**
 * What the analytics of an app can answer: the six operations with their options, groupings and filters, every
 * chart and conversion of the dashboard, and every filter key. Passed through as the server sends it.
 */

/** A grouping: `key` is what `--group-by` takes. */
export type CatalogSegmentation = {
    key: string;
    label: string;
};

/** One query field: `values` lists the accepted values when they are a fixed set. */
export type CatalogOption = {
    default: boolean | null | string;
    name: string;
    values: null | string[];
};

export type CatalogOperation = {
    can_compare: boolean;
    /** Filter keys; for `metrics` they depend on the chart and are in `charts`. */
    filters: string[];
    id: string;
    method: string;
    options: CatalogOption[];
    path: string;
    segmentations: CatalogSegmentation[];
};

export type CatalogChart = {
    default_segmentation: null | string;
    filters: string[];
    id: string;
    segmentations: CatalogSegmentation[];
    takes_revenue_basis: boolean;
    title: string;
    unit: string;
};

export type CatalogConversion = {
    id: string;
    title: string;
};

export type CatalogDimension = {
    key: string;
    label: string;
};

export type AnalyticsCatalog = {
    charts: CatalogChart[];
    conversions: CatalogConversion[];
    dimensions: CatalogDimension[];
    operations: CatalogOperation[];
};

export type CatalogResponse = {
    data: AnalyticsCatalog;
};
