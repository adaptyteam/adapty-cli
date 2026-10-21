import { Args, Flags } from '@oclif/core';

import { usageError } from '../errors.js';

import { uuidParser } from './app.js';

import type { MetricsInput } from '../../sdk/adapty/index.js';

/**
 * What the `flows metrics` and `placements metrics` commands share: the flags of the question, the
 * ids, and the one place where flag names meet sdk field names. The values of `--based-on`,
 * `--granularity`, `--date-type` and `--group-by` are the server's to check, so these flags take
 * any string and the help names the values: a wrong one comes back as the server's 400.
 */

/** The shape only: whether the day exists is the server's knowledge. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const dateParser = (input: string): Promise<string> => (ISO_DATE.test(input)
    ? Promise.resolve(input)
    : Promise.reject(usageError('Dates must be written as YYYY-MM-DD.')));

/** One `--filter key=value`; the same key given twice becomes two values of one filter. */
export type MetricsFilter = {
    key: string;
    value: string;
};

const parseFilter = (input: string): Promise<MetricsFilter> => {
    const separator = input.indexOf('=');
    const key = separator === -1 ? '' : input.slice(0, separator).trim();

    // An empty value is allowed: the "No Data" leaves of `values` are empty strings
    return key === ''
        ? Promise.reject(usageError(`Expected key=value, got "${input}".`))
        : Promise.resolve({ key, value: input.slice(separator + 1) });
};

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
        description: 'Placement type, as `placements list` shows it (flow is the only one these routes take today)',
        required: true,
    }),
};

export const timezoneFlag = {
    timezone: Flags.string({
        description: 'IANA time zone for the day boundaries, e.g. Europe/Berlin (sent as the Adapty-Tz header)',
    }),
};

export const csvFlag = {
    csv: Flags.boolean({
        description: 'Print CSV instead of the table, built by the CLI from the answer (not with --json)',
    }),
};

/** oclif's `exclusive` does not see its own --json flag, so the pair is refused here, before any request. */
export const assertCsvOrJson = (csv: boolean, json: boolean): void => {
    if (csv && json) {
        throw usageError('--csv and --json cannot be used together.');
    }
};

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
    'date-type': Flags.string({
        description: 'Which date the period applies to: purchase_date or profile_install_date',
    }),
    'filter': Flags.custom<MetricsFilter>({
        description: 'Keep data with this filter value: key=value, as `metrics values` lists them (repeatable)',
        multiple: true,
        parse: parseFilter,
    })(),
    'granularity': Flags.string({
        description: 'Split the period into points: day, week, month, quarter or year',
    }),
    ...timezoneFlag,
};

export const depthFlag = {
    depth: Flags.integer({
        default: 1,
        description: 'Levels of the tree to print under Total (--json and --csv always have the whole tree)',
        min: 1,
    }),
};

type QueryFlags = {
    'based-on'?: string | undefined;
    'date-from'?: string | undefined;
    'date-to'?: string | undefined;
    'date-type'?: string | undefined;
    'filter'?: MetricsFilter[] | undefined;
    'granularity'?: string | undefined;
    'group-by'?: string | undefined;
    'timezone'?: string | undefined;
};

const groupFilters = (filters: readonly MetricsFilter[] | undefined): Record<string, string[]> | undefined => {
    if (filters === undefined || filters.length === 0) {
        return undefined;
    }

    const grouped: Record<string, string[]> = {};

    for (const { key, value } of filters) {
        (grouped[key] ??= []).push(value);
    }

    return grouped;
};

/** The one place where the flag names meet the sdk's field names. */
export const metricsInput = (flags: QueryFlags): MetricsInput => ({
    basedOn: flags['based-on'],
    dateFrom: flags['date-from'],
    dateTo: flags['date-to'],
    dateType: flags['date-type'],
    filters: groupFilters(flags.filter),
    granularity: flags.granularity,
    groupBy: flags['group-by'],
    timezone: flags.timezone,
});
