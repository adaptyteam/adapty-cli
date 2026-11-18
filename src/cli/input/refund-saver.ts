import { Args, Flags } from '@oclif/core';

import { refundStores } from '../../sdk/adapty/index.js';

import { dayRangeFlags } from './period.js';
import { uuidParser } from './uuid.js';

import type { RefundPeriodInput } from '../../sdk/adapty/index.js';

export const profileIdArg = {
    profile_id: Args.string({
        description: 'Adapty profile ID (UUID)',
        parse: uuidParser('Invalid profile ID format: pass the Adapty profile ID (UUID), not the customer user ID.'),
        required: true,
    }),
};

/** The period and store of `requests` and `metrics`: UTC days on the date the store request was handled. */
export const refundPeriodFlags = {
    ...dayRangeFlags('UTC'),
    store: Flags.option({
        description: 'Only the requests of this store',
        options: refundStores,
    })(),
};

export const refundPeriodInput = (flags: {
    'date-from': string;
    'date-to': string;
    'store'?: RefundPeriodInput['store'];
}): RefundPeriodInput => ({ dateFrom: flags['date-from'], dateTo: flags['date-to'], store: flags.store });
