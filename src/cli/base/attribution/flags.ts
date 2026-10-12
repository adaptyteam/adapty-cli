import { Flags } from '@oclif/core';

import { revenueBases } from '../../../sdk/attribution/index.js';
import { dayRangeFlags } from '../../input/period.js';

/** An inclusive day range, both ends required. */
export const periodFlags = dayRangeFlags('in the app timezone');

/** Where the period flags meet the sdk's field names. */
export const periodParams = (flags: { 'date-from': string; 'date-to': string }): { dateFrom: string; dateTo: string } =>
    ({ dateFrom: flags['date-from'], dateTo: flags['date-to'] });

export const revenueBasisFlag = {
    'revenue-basis': Flags.option({
        description: 'Which revenue the revenue metrics use; the backend default applies when omitted',
        options: revenueBases,
    })(),
};
