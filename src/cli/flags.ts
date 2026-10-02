import { Args, Flags } from '@oclif/core';

import { ISO_DATE } from '../sdk/core/dates.js';

import { usageError } from './errors.js';

import type { PageParams, RevenueBasis as AnalyticsRevenueBasis } from '../sdk/adapty/index.js';
import type { RevenueBasis as AttributionRevenueBasis } from '../sdk/attribution/index.js';

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** The published wording of both the `app_id` arg and the `--app` flag. */
const APP_ID_HINT = 'Invalid app ID format. Run `adapty apps list` to find your app ID.';

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

/**
 * Checking the shape of a value is the parser's job, so a run() never starts with one. oclif turns
 * a *flag* parser's failure into exit 2 itself but passes an *arg* parser's error through, hence
 * the explicit code. The hint is per resource: `adapty apps list` only helps for an app id.
 */
const uuidParser = (hint: string) => (input: string): Promise<string> => (isUuid(input)
    ? Promise.resolve(input)
    : Promise.reject(usageError(hint)));

/** Spread into a command: `static args = { ...appIdArg }`. Texts kept as published. */
export const appIdArg = {
    app_id: Args.string({
        description: 'App ID (UUID)',
        parse: uuidParser(APP_ID_HINT),
        required: true,
    }),
};

/** `appIdArg` as a flag: `static flags = { ...appIdFlag }`. Texts kept as the published `--app`. */
export const appIdFlag = {
    app: Flags.string({
        description: 'App ID (UUID)',
        parse: uuidParser(APP_ID_HINT),
        required: true,
    }),
};

/** The published defaults, so a migrated `list` asks for the same page as an untouched one. */
export const paginationFlags = {
    'page': Flags.integer({ default: 1, description: 'Page number', min: 1 }),
    'page-size': Flags.integer({ default: 20, description: 'Items per page (max 100)', max: 100, min: 1 }),
};

/** The one place where flag names meet sdk field names. */
export const pageParams = (flags: { 'page': number; 'page-size': number }): PageParams =>
    ({ page: flags.page, pageSize: flags['page-size'] });

/** The shape only: whether the day exists and the order of the two are sdk rules. */
const dateParser = (input: string): Promise<string> => (ISO_DATE.test(input)
    ? Promise.resolve(input)
    : Promise.reject(usageError('Dates must be written as YYYY-MM-DD.')));

/** An inclusive day range, both ends required. */
export const periodFlags = {
    'date-from': Flags.string({
        description: 'First day of the period, inclusive (YYYY-MM-DD, in the app timezone)',
        parse: dateParser,
        required: true,
    }),
    'date-to': Flags.string({
        description: 'Last day of the period, inclusive (YYYY-MM-DD, in the app timezone)',
        parse: dateParser,
        required: true,
    }),
};

/** Where the period flags meet the sdk's field names. */
export const periodParams = (flags: { 'date-from': string; 'date-to': string }): { dateFrom: string; dateTo: string } =>
    ({ dateFrom: flags['date-from'], dateTo: flags['date-to'] });

/**
 * Attribution and analytics price revenue the same three ways. The list is spelled here because a
 * value import from either sdk would load it for the other product's commands; the type check
 * keeps it in step with both.
 */
const revenueBases = ['gross', 'proceeds', 'net'] as const satisfies readonly AnalyticsRevenueBasis[] satisfies readonly AttributionRevenueBasis[];

export const revenueBasisFlag = {
    'revenue-basis': Flags.option({
        description: 'Which revenue the revenue metrics use; the backend default applies when omitted',
        options: revenueBases,
    })(),
};

/** A comma not preceded by a backslash: `\,` keeps a comma inside a value, as oclif's own delimiter does. */
const VALUE_SEPARATOR = /(?<!\\),/;

export type DimensionFilter = {
    dimension: string;
    values: string[];
};

/** `dimension=value[,value]`: one value filters by equality, several by any of them. */
export const parseDimensionFilter = (input: string): Promise<DimensionFilter> => {
    const separator = input.indexOf('=');
    const dimension = separator === -1 ? '' : input.slice(0, separator).trim();

    const values = separator === -1
        ? []
        : input.slice(separator + 1).split(VALUE_SEPARATOR).map(value => value.replaceAll('\\,', ',').trim())
                .filter(value => value !== '');

    return dimension === '' || values.length === 0
        ? Promise.reject(usageError(`Expected dimension=value[,value], got "${input}".`))
        : Promise.resolve({ dimension, values });
};
