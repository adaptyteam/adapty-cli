import { Args, Errors, Flags } from '@oclif/core';

import { revenueBases } from '../sdk/attribution/index.js';

import { exitCode } from './errors.js';

import type { PageParams } from '../sdk/adapty/index.js';

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    : Promise.reject(new Errors.CLIError(hint, { exit: exitCode.usage })));

/** The shape only: whether the day exists and the order of the two are sdk rules. */
const dateParser = (input: string): Promise<string> => (DATE_PATTERN.test(input)
    ? Promise.resolve(input)
    : Promise.reject(new Errors.CLIError('Dates must be written as YYYY-MM-DD.', { exit: exitCode.usage })));

/** Spread into a command: `static args = { ...appIdArg }`. Texts kept as published. */
export const appIdArg = {
    app_id: Args.string({
        description: 'App ID (UUID)',
        parse: uuidParser(APP_ID_HINT),
        required: true,
    }),
};

/** Spread into a command: `static flags = { ...appFlag }`. Texts kept as the published `--app`. */
export const appFlag = {
    app: Flags.string({
        description: 'App ID (UUID)',
        parse: uuidParser(APP_ID_HINT),
        required: true,
    }),
};

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

export const revenueBasisFlag = {
    'revenue-basis': Flags.option({
        description: 'Which revenue the revenue metrics use; the backend default applies when omitted',
        options: revenueBases,
    })(),
};

/** The published defaults, so a migrated `list` asks for the same page as an untouched one. */
export const paginationFlags = {
    'page': Flags.integer({ default: 1, description: 'Page number', min: 1 }),
    'page-size': Flags.integer({ default: 20, description: 'Items per page (max 100)', max: 100, min: 1 }),
};

/** The one place where flag names meet sdk field names. */
export const pageParams = (flags: { 'page': number; 'page-size': number }): PageParams =>
    ({ page: flags.page, pageSize: flags['page-size'] });

export const periodParams = (flags: { 'date-from': string; 'date-to': string }): { dateFrom: string; dateTo: string } =>
    ({ dateFrom: flags['date-from'], dateTo: flags['date-to'] });
