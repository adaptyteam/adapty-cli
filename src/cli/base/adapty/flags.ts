import { Flags } from '@oclif/core';

import { periodTypes, periodUnits, revenueBases } from '../../../sdk/adapty/index.js';
import { usageError } from '../../errors.js';
import { splitFilter } from '../../input/filter.js';
import { dateParser, dayRangeFlags } from '../../input/period.js';

import type { AnalyticsFilter, PeriodUnit } from '../../../sdk/adapty/index.js';

/** The flags the analytics commands share. A flag left out leaves its field out: the backend default applies. */

/** Days of the query time zone: `--timezone`, else the app zone. */
export const periodFlags = dayRangeFlags('in the --timezone zone, else the app time zone');

/** Only the chart and the conversion take them: the other queries mix two periods into one. */
export const compareFlags = {
    'compare-from': Flags.string({
        description: 'First day of a period to compare with, inclusive (YYYY-MM-DD); needs --compare-to',
        parse: dateParser,
    }),
    'compare-to': Flags.string({
        description: 'Last day of a period to compare with, inclusive (YYYY-MM-DD); needs --compare-from',
        parse: dateParser,
    }),
};

/**
 * `dimension=value[,value]` with every value exactly as written. An empty value is a value: `country=` keeps the
 * data without a country, as the dashboard filter does.
 */
const parseExactFilter = (input: string): Promise<AnalyticsFilter> => {
    const filter = splitFilter(input);

    return filter === undefined
        ? Promise.reject(usageError(`Expected dimension=value[,value] (an empty value is a value), got "${input}".`))
        : Promise.resolve(filter);
};

export const filterFlags = {
    filter: Flags.custom<AnalyticsFilter>({
        description: 'Keep the data whose dimension has one of the values: dimension=value[,value] (repeatable; `\\,` '
            + 'for a comma inside a value; values exactly as written, an empty one too, e.g. country= for no country). '
            + 'Dimensions: `adapty analytics catalog`; values: `adapty analytics values`',
        multiple: true,
        parse: parseExactFilter,
    })(),
    timezone: Flags.string({
        description: 'IANA time zone of the days, e.g. Europe/Berlin; the app time zone when omitted',
    }),
};

export const groupByFlag = {
    'group-by': Flags.string({
        description: 'One grouping of this operation, as `adapty analytics catalog` lists it (e.g. country)',
    }),
};

/** The text differs per command: the period of one point, or the length of one cohort. */
export const granularityFlag = (description: string) => ({
    granularity: Flags.option({ description, options: periodUnits })(),
});

export const revenueBasisFlag = {
    'revenue-basis': Flags.option({
        description: 'Which revenue the money values use: gross (default), proceeds (after store commission) or net (also after taxes)',
        options: revenueBases,
    })(),
};

export const renewalPeriodFlags = {
    'period-type': Flags.option({
        description: 'Count per renewal (renewals, default) or per day since the install (days)',
        options: periodTypes,
    })(),
    'renewal-days': Flags.integer({
        delimiter: ',',
        description: 'The days to count with --period-type days (comma-separated or repeatable); the backend list when omitted',
        min: 0,
        multiple: true,
    }),
};

export const csvFlag = {
    csv: Flags.boolean({
        description: 'Print a CSV table made from the API answer: one row per group, the total first (is_total true; '
            + 'a null key is an empty cell, an empty key is written ""); a compared period in compare.* columns of the same row; '
            + 'the numbers of the whole answer in data.* and meta.* columns. No groups: the header line, and "No data for '
            + 'this period." with those numbers on stderr',
        exclusive: ['json'],
    }),
};

type QueryFlags = {
    'app': string;
    'date-from': string;
    'date-to': string;
    'filter'?: AnalyticsFilter[] | undefined;
    'timezone'?: string | undefined;
};

/** Where the shared flags meet the sdk's field names. */
export const queryParams = (flags: QueryFlags) => ({
    appId: flags.app,
    dateFrom: flags['date-from'],
    dateTo: flags['date-to'],
    filters: flags.filter,
    timezone: flags.timezone,
});

/** The compare flags as the sdk names them; a chart and a conversion take them. */
export const compareParams = (flags: { 'compare-from'?: string | undefined; 'compare-to'?: string | undefined }) => ({
    compareFrom: flags['compare-from'],
    compareTo: flags['compare-to'],
});

/** The grouping and the period of one point as the sdk names them; a command without one of the flags leaves it out. */
export const groupingParams = (flags: { 'granularity'?: PeriodUnit | undefined; 'group-by'?: string | undefined }) => ({
    granularity: flags.granularity,
    groupBy: flags['group-by'],
});
