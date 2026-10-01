import { Flags } from '@oclif/core';

import { ISO_DATE, revenueBases } from '../../../sdk/attribution/index.js';
import { usageError } from '../../errors.js';

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

export const revenueBasisFlag = {
    'revenue-basis': Flags.option({
        description: 'Which revenue the revenue metrics use; the backend default applies when omitted',
        options: revenueBases,
    })(),
};

/** Where the period flags meet the sdk's field names. */
export const periodParams = (flags: { 'date-from': string; 'date-to': string }): { dateFrom: string; dateTo: string } =>
    ({ dateFrom: flags['date-from'], dateTo: flags['date-to'] });
