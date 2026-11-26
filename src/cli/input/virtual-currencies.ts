import { Args, Flags } from '@oclif/core';

import { dateParser } from './period.js';
import { uuidParser } from './uuid.js';

import type { LedgerQuery, ProfileAddress } from '../../sdk/adapty/index.js';

/** The flags and arguments of the `virtual-currencies` commands, and where they meet sdk field names. */

export const currencyIdArg = {
    virtual_currency_id: Args.string({
        description: 'Virtual currency ID (UUID), as `virtual-currencies list` shows it',
        parse: uuidParser('Invalid virtual currency ID format. Run `adapty virtual-currencies list --app <app>` to find it.'),
        required: true,
    }),
};

const MAPPINGS_FILE = 'Path to a JSON array of full mapping items, or - for stdin. One-time: {product_id, product_type: '
    + '"one-time", credit_per_purchase}; subscription: {product_id, product_type: "subscription", credit_per_cycle, '
    + 'expiring, credit_on_trial_start} (null: no coins on a trial)';

/** The mappings of an upsert. */
export const mappingsFileFlag = { file: Flags.string({ description: MAPPINGS_FILE, required: true }) };

/** The mappings of a create: left out, the currency has none. */
export const optionalMappingsFileFlag = { file: Flags.string({ description: MAPPINGS_FILE }) };

export const expectedUpdatedAtFlag = {
    'expected-updated-at': Flags.integer({
        description: 'The updated_at of the currency that the user saw, as `virtual-currencies get --json` shows it; '
            + 'the write fails with 409 when somebody changed the currency after that. Required with --yes',
    }),
};

/** The filters of a ledger read. A value is sent as given: the server owns the value lists. */
export const ledgerFilterFlags = {
    'timezone': Flags.string({
        description: 'IANA time zone of the days, e.g. Europe/Berlin; the app time zone when omitted',
    }),
    'currency-code': Flags.string({ description: 'Only the rows of this currency code' }),
    'operation': Flags.string({
        description: 'Only the rows of this operation, e.g. top_up, spend, refund, reward, expiry or adjustment',
    }),
    'feature': Flags.string({ description: 'Only the rows of this feature' }),
    'sandbox': Flags.boolean({
        allowNo: true,
        description: 'Only sandbox rows (--sandbox) or only production rows (--no-sandbox); both when omitted',
    }),
};

/** The optional period of the profile history; the app list makes both days required. */
export const optionalPeriodFlags = {
    'date-from': Flags.string({
        description: 'First day of the period, inclusive (YYYY-MM-DD, in the --timezone zone, else the app time zone)',
        parse: dateParser,
    }),
    'date-to': Flags.string({
        description: 'Last day of the period, inclusive (YYYY-MM-DD, in the --timezone zone, else the app time zone)',
        parse: dateParser,
    }),
};

type LedgerFlags = {
    'currency-code'?: string | undefined;
    'date-from'?: string | undefined;
    'date-to'?: string | undefined;
    'feature'?: string | undefined;
    'operation'?: string | undefined;
    'sandbox'?: boolean | undefined;
    'timezone'?: string | undefined;
};

export const ledgerParams = (flags: LedgerFlags): LedgerQuery => ({
    currencyCode: flags['currency-code'],
    dateFrom: flags['date-from'],
    dateTo: flags['date-to'],
    feature: flags.feature,
    operation: flags.operation,
    sandbox: flags.sandbox,
    timezone: flags.timezone,
});

/** A profile by exactly one of the two: the sdk refuses both and neither before any request. */
export const profileAddressFlags = {
    'profile': Flags.string({
        description: 'Profile ID (UUID); or give --customer-user-id',
        parse: uuidParser('Invalid profile ID format.'),
    }),
    'customer-user-id': Flags.string({ description: 'The customer user ID of the profile in your app; or give --profile' }),
};

export const profileAddress = (flags: { 'customer-user-id'?: string | undefined; 'profile'?: string | undefined }): ProfileAddress =>
    ({ customerUserId: flags['customer-user-id'], profile: flags.profile });
