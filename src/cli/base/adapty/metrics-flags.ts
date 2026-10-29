import { Args, Flags } from '@oclif/core';

import { dateParser } from '../../input/period.js';
import { uuidParser } from '../../input/uuid.js';

import { filterFlags, parseExactFilter } from './flags.js';

import type { AnalyticsFilter, MetricsInput } from '../../../sdk/adapty/index.js';

/**
 * The flags and arguments only the metrics commands of the Adapty product take (`flows metrics`,
 * `placements metrics`), and the one place where they meet the sdk's field names. The values of
 * `--based-on`, `--granularity`, `--date-type`, `--group-by` and `--type` are the server's to
 * check, so these flags take any string and the help names the values: a wrong one comes back as
 * the server's 400.
 */

export const flowIdArg = {
    flow_id: Args.string({
        description: 'Flow ID (UUID)',
        parse: uuidParser('Invalid flow ID format. Run `adapty flows list` to find a flow ID.'),
        required: true,
    }),
};

export const placementIdArg = {
    placement_id: Args.string({
        description: 'Placement ID (UUID)',
        parse: uuidParser('Invalid placement ID format. Run `adapty placements list` to find a placement ID.'),
        required: true,
    }),
};

const idsFlag = (entity: string, parse: (input: string) => Promise<string>) => ({
    ids: Flags.string({
        delimiter: ',',
        description: `${entity} IDs (UUIDs; repeatable or comma-separated)`,
        multiple: true,
        parse,
        required: true,
    }),
});

export const flowIdsFlag = idsFlag('Flow', uuidParser('Invalid flow ID format in --ids.'));
export const placementIdsFlag = idsFlag('Placement', uuidParser('Invalid placement ID format in --ids.'));

/** The placement type the placement routes require; the server refuses one that does not match. */
export const placementTypeFlag = {
    type: Flags.string({
        description: 'Placement type, as `placements list` shows it',
        required: true,
    }),
};

export const metricsCsvFlag = {
    csv: Flags.boolean({
        description: 'Print CSV instead of the table, built by the CLI from the answer',
        exclusive: ['json'],
    }),
};

export const depthFlag = {
    depth: Flags.integer({
        default: 1,
        description: 'Levels of the tree to print under Total (--json and --csv always have the whole tree)',
        min: 1,
    }),
};

const dateTypeDescription = 'Which date the period applies to: purchase_date or profile_install_date';

/** No default: a flow placement takes it together with the day range, a flow always (`requiredDateTypeFlag`). */
export const dateTypeFlag = { 'date-type': Flags.string({ description: dateTypeDescription }) };
export const requiredDateTypeFlag = { 'date-type': Flags.string({ description: dateTypeDescription, required: true }) };

/** The question of a `get`, flags only. `--based-on` and `--group-by` differ per entity and live with it. */
export const metricsQueryFlags = {
    'date-from': Flags.string({
        description: 'First day of the period, inclusive (YYYY-MM-DD)',
        parse: dateParser,
    }),
    'date-to': Flags.string({
        description: 'Last day of the period, inclusive (YYYY-MM-DD)',
        parse: dateParser,
    }),
    'filter': Flags.custom<AnalyticsFilter>({
        description: 'Keep data with these values of a filter key: key=value[,value], as `metrics values` lists them '
            + '(repeatable; `\\,` for a comma inside a value; values exactly as written)',
        multiple: true,
        parse: parseExactFilter,
    })(),
    'granularity': Flags.string({
        description: 'Split the period into points: day, week, month, quarter or year',
    }),
    'timezone': filterFlags.timezone,
};

type QueryFlags = {
    'based-on'?: string | undefined;
    'date-from'?: string | undefined;
    'date-to'?: string | undefined;
    'date-type'?: string | undefined;
    'filter'?: AnalyticsFilter[] | undefined;
    'granularity'?: string | undefined;
    'group-by'?: string | undefined;
    'timezone'?: string | undefined;
};

/** Where the flag names meet the sdk's field names. */
export const metricsInput = (flags: QueryFlags): MetricsInput => ({
    basedOn: flags['based-on'],
    dateFrom: flags['date-from'],
    dateTo: flags['date-to'],
    dateType: flags['date-type'],
    filters: flags.filter,
    granularity: flags.granularity,
    groupBy: flags['group-by'],
    timezone: flags.timezone,
});
