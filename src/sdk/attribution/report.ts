import { validateDateRange } from '../core/dates.js';

import type { Issue } from '../core/errors.js';

/** In the order the backend documents them, so a flag's help reads the same way. */
export const reportGroupBy = ['date', 'campaign', 'adset', 'ad', 'keyword', 'channel', 'country', 'store'] as const;
export type ReportGroupBy = (typeof reportGroupBy)[number];

export const granularities = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type Granularity = (typeof granularities)[number];

export const revenueBases = ['gross', 'proceeds', 'net'] as const;
export type RevenueBasis = (typeof revenueBases)[number];

export const sortDirections = ['asc', 'desc'] as const;
export type SortDirection = (typeof sortDirections)[number];

/** One value filters by equality, several by any of them. */
export type ReportFilter = {
    dimension: string;
    values: readonly string[];
};

export type ReportSort = {
    direction: SortDirection;
    field: string;
};

/** Dates are inclusive days in the app's timezone, `YYYY-MM-DD`. */
export type ReportInput = {
    appId: string;
    dateFrom: string;
    dateTo: string;
    filters?: readonly ReportFilter[] | undefined;
    granularity?: Granularity | undefined;
    groupBy: readonly ReportGroupBy[];
    /** Catalog names, as `attribution.metrics()` lists them. */
    metrics: readonly string[];
    revenueBasis?: RevenueBasis | undefined;
    sort?: ReportSort | undefined;
};

type ReportRequest = {
    app_id: string;
    date_from: string;
    date_to: string;
    filters?: { dimension: string; values: string[] }[];
    granularity?: Granularity;
    group_by: ReportGroupBy[];
    metrics: string[];
    revenue_basis?: RevenueBasis;
    sort?: { direction: SortDirection; field: string };
};

/** Group keys and metric values by name; a metric that cannot be computed is null. */
export type ReportRow = Record<string, unknown>;

export type ReportData = {
    rows: ReportRow[];
    totals: null | Record<string, unknown>;
};

export type ReportMeta = {
    /** The query as the backend resolved it: timezone, currency and defaults filled in. */
    query: Record<string, unknown>;
};

/**
 * The rules a report can break without asking the server. Which metric and dimension names exist
 * is the catalog's knowledge, so the backend checks those. An Issue path names an input field
 * (camelCase) and the adapter turns it into the flag the user typed.
 */
export const validateReport = (input: ReportInput): Issue[] => {
    const issues = validateDateRange(input);

    if (input.metrics.length === 0) {
        issues.push({ message: 'at least one metric is required', path: 'metrics' });
    }

    if (input.groupBy.length === 0) {
        issues.push({ message: 'at least one grouping is required', path: 'groupBy' });
    }

    const groupsByDate = input.groupBy.includes('date');

    if (input.granularity !== undefined && !groupsByDate) {
        issues.push({ message: 'applies only when grouping by date', path: 'granularity' });
    }

    // The backend's rule, in its wording: without a bucket a date grouping is refused there anyway
    if (input.granularity === undefined && groupsByDate) {
        issues.push({
            message: `grouping by date requires exactly one granularity: ${granularities.join(', ')}`,
            path: 'granularity',
        });
    }

    return issues;
};

/** An absent optional field is left out of the body: the backend applies its own default. */
export const toReportRequest = (input: ReportInput): ReportRequest => {
    const body: ReportRequest = {
        app_id: input.appId,
        date_from: input.dateFrom,
        date_to: input.dateTo,
        group_by: [...input.groupBy],
        metrics: [...input.metrics],
    };

    if (input.filters !== undefined) {
        body.filters = input.filters.map(filter => ({ dimension: filter.dimension, values: [...filter.values] }));
    }

    if (input.granularity !== undefined) {
        body.granularity = input.granularity;
    }

    if (input.revenueBasis !== undefined) {
        body.revenue_basis = input.revenueBasis;
    }

    if (input.sort !== undefined) {
        body.sort = { direction: input.sort.direction, field: input.sort.field };
    }

    return body;
};
