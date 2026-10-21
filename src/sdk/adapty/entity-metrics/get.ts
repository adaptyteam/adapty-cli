import type { Issue } from '../../core/errors.js';

/**
 * What a `get` takes, for a flow and for a flow placement. The values are the server's words and
 * the server owns the lists (`based_on`, `period_unit`, `date_type`, `segmentation_by`), so none
 * is checked here: a wrong one comes back as a 400 that names the valid ones.
 *
 * Dates are inclusive days. The server applies them to a flow placement only together with
 * `dateType`, and refuses `dateType` without them.
 */
export type MetricsInput = {
    basedOn?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    dateType?: string | undefined;
    /** Filter key → leaf values, as the `values` route lists them. */
    filters?: Readonly<Record<string, readonly string[]>> | undefined;
    granularity?: string | undefined;
    /** Flow placements only; `country` and `store`. */
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

    for (const [key, values] of Object.entries(input.filters ?? {})) {
        filters[key] = [...values];
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
