import { validateDayRange } from '../../core/dates.js';

import type { Issue } from '../../core/errors.js';

/** One filter: a dimension key from the catalog and the raw values it keeps (any of them). */
export type AnalyticsFilter = {
    dimension: string;
    values: readonly string[];
};

/** What every operation takes. Dates are inclusive days of the query time zone, `YYYY-MM-DD`. */
export type AnalyticsQueryInput = {
    appId: string;
    dateFrom: string;
    dateTo: string;
    filters?: readonly AnalyticsFilter[] | undefined;
    /** An IANA name; the app time zone when left out. Which names exist is the backend's knowledge. */
    timezone?: string | undefined;
};

/** The two operations whose query keeps two periods apart: a chart and a conversion. */
export type ComparableQueryInput = AnalyticsQueryInput & {
    compareFrom?: string | undefined;
    compareTo?: string | undefined;
};

/** `date` and `compare_date` are `[start, end]`; every other key is a dimension with its values. */
export type FiltersRequest = Record<string, string[]>;

export type QueryRequest = {
    filters: FiltersRequest;
    timezone?: string;
};

/** The period has flags of its own; as a filter it would replace them without a word. */
const PERIOD_KEYS = new Set(['compare_date', 'date']);

export const validateQuery = (input: AnalyticsQueryInput): Issue[] => {
    const issues = validateDayRange(input.dateFrom, input.dateTo, { from: 'dateFrom', to: 'dateTo' });

    for (const filter of input.filters ?? []) {
        if (PERIOD_KEYS.has(filter.dimension)) {
            issues.push({ message: `${filter.dimension} is not a filter: the period has flags of its own`, path: 'filter' });
        }
    }

    return issues;
};

/** A compared period is both ends or neither, and a real range: the backend has no default for half of one. */
export const validateComparableQuery = (input: ComparableQueryInput): Issue[] => {
    const issues = validateQuery(input);
    const { compareFrom, compareTo } = input;

    if (compareFrom === undefined && compareTo === undefined) {
        return issues;
    }

    if (compareFrom === undefined) {
        return [...issues, { message: 'required with the end of the compared period', path: 'compareFrom' }];
    }

    if (compareTo === undefined) {
        return [...issues, { message: 'required with the start of the compared period', path: 'compareTo' }];
    }

    return [...issues, ...validateDayRange(compareFrom, compareTo, { from: 'compareFrom', to: 'compareTo' })];
};

/**
 * The fields every operation sends. Filters are a map of dimension to values, as the dashboard sends them: two
 * filters of one dimension become one list (a value kept by either is kept by the union), each value once.
 * An absent timezone is left out, so the backend applies the app zone and says so in `meta.query`.
 */
export const toQueryRequest = (input: ComparableQueryInput): QueryRequest => {
    const filters: FiltersRequest = { date: [input.dateFrom, input.dateTo] };

    if (input.compareFrom !== undefined && input.compareTo !== undefined) {
        filters.compare_date = [input.compareFrom, input.compareTo];
    }

    for (const filter of input.filters ?? []) {
        const known = filters[filter.dimension] ?? [];

        filters[filter.dimension] = [...new Set([...known, ...filter.values])];
    }

    const body: QueryRequest = { filters };

    if (input.timezone !== undefined) {
        body.timezone = input.timezone;
    }

    return body;
};
