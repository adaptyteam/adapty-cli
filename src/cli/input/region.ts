import { Flags } from '@oclif/core';

import { usageError } from '../errors.js';

/** Where an Adapty account lives. A session file with no region is a US session. */
export const regions = ['us', 'eu'] as const;

export type Region = typeof regions[number];

export const isRegion = (value: unknown): value is Region => regions.includes(value as Region);

/**
 * `auth login` only: every other command takes its region from ADAPTY_REGION or the saved session.
 * Hidden, as the help and the README stay the same for people; the agent docs name it.
 */
export const regionFlag = Flags.option({
    description: 'Account region to log in to',
    hidden: true,
    options: regions,
})();

/** ADAPTY_REGION: unset or empty says nothing; any other value than us or eu is bad input, before any request. */
export const regionFromEnv = (value: string | undefined): Region | undefined => {
    if (value === undefined || value === '') {
        return undefined;
    }

    if (!isRegion(value)) {
        throw usageError(`Invalid ADAPTY_REGION \`${value}\`: use us or eu.`);
    }

    return value;
};
