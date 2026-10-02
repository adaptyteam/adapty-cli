import { validateDateRange } from '../../core/dates.js';

import type { PeriodUnit, RevenueBasis } from './model.js';
import type { Issue } from '../../core/errors.js';

/** One value filters by equality, several by any of them; filters on different dimensions combine with AND. */
export type ChartFilter = {
    dimension: string;
    values: readonly string[];
};

/** Dates are inclusive days in the app's timezone, `YYYY-MM-DD`. */
export type ChartInput = {
    appId: string;
    /** A chart id, as `analytics.catalog()` lists it. */
    chartId: string;
    dateFrom: string;
    dateTo: string;
    filters?: readonly ChartFilter[] | undefined;
    periodUnit?: PeriodUnit | undefined;
    revenueBasis?: RevenueBasis | undefined;
    /** A dimension to break the chart down by, as the catalog lists it for the chart. */
    segmentation?: string | undefined;
};

type ChartRequest = {
    chart_id: string;
    filters: Record<string, string[]>;
    period_unit?: PeriodUnit;
    revenue_basis?: RevenueBasis;
    segmentation?: string;
};

/**
 * The rules a chart query can break without asking the server. Which chart, segmentation and
 * filter names exist, and which pairs of them go together, is the catalog's knowledge, so the
 * server checks those.
 */
export const validateChart = (input: ChartInput): Issue[] => {
    const issues = validateDateRange(input);

    if (input.chartId.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'chartId' });
    }

    const seen = new Set<string>();

    for (const { dimension } of input.filters ?? []) {
        // The period is a filter in the body, and two sources for it would be one too many
        if (dimension === 'date') {
            issues.push({ message: 'the period is set by --date-from and --date-to, not by a date filter', path: 'filter' });
        } else if (seen.has(dimension)) {
            issues.push({ message: `${dimension} is given twice: list its values once, as ${dimension}=a,b`, path: 'filter' });
        }

        seen.add(dimension);
    }

    return issues;
};

/** An absent optional field is left out of the body: the server applies its own default. */
export const toChartRequest = (input: ChartInput): ChartRequest => {
    const filters: Record<string, string[]> = { date: [input.dateFrom, input.dateTo] };

    for (const filter of input.filters ?? []) {
        filters[filter.dimension] = [...filter.values];
    }

    const body: ChartRequest = { chart_id: input.chartId, filters };

    if (input.periodUnit !== undefined) {
        body.period_unit = input.periodUnit;
    }

    if (input.segmentation !== undefined) {
        body.segmentation = input.segmentation;
    }

    if (input.revenueBasis !== undefined) {
        body.revenue_basis = input.revenueBasis;
    }

    return body;
};
