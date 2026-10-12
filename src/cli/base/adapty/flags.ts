import { Flags } from '@oclif/core';

import { periodTypes, periodUnits, revenueBases } from '../../../sdk/adapty/index.js';
import { parseFilter } from '../../input/filter.js';
import { dateParser } from '../../input/period.js';

import type { AnalyticsFilter } from '../../../sdk/adapty/index.js';

/** The flags the analytics commands share. A flag left out leaves its field out: the backend default applies. */

/** Days of the query time zone: `--timezone`, else the app zone. */
export const analyticsPeriodFlags = {
    'date-from': Flags.string({
        description: 'First day of the period, inclusive (YYYY-MM-DD, in the --timezone zone, else the app time zone)',
        parse: dateParser,
        required: true,
    }),
    'date-to': Flags.string({
        description: 'Last day of the period, inclusive (YYYY-MM-DD, in the --timezone zone, else the app time zone)',
        parse: dateParser,
        required: true,
    }),
};

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

export const analyticsFilterFlags = {
    filter: Flags.custom<AnalyticsFilter>({
        description: 'Keep the data whose dimension has one of the values: dimension=value[,value] (repeatable; `\\,` '
            + 'for a comma inside a value). Dimensions: `adapty analytics catalog`; values: `adapty analytics values`',
        multiple: true,
        parse: parseFilter,
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

export const analyticsRevenueBasisFlag = {
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
        description: 'Print a CSV table made from the API answer: one row per segment, the total first',
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
export const analyticsQueryParams = (flags: QueryFlags) => ({
    appId: flags.app,
    dateFrom: flags['date-from'],
    dateTo: flags['date-to'],
    filters: flags.filter,
    timezone: flags.timezone,
});
