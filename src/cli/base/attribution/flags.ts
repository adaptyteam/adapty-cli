import { Flags } from '@oclif/core';

import { revenueBases } from '../../../sdk/attribution/index.js';
import { usageError } from '../../errors.js';
import { splitFilter } from '../../input/filter.js';
import { dayRangeFlags } from '../../input/period.js';

import type { DimensionFilter } from '../../input/filter.js';

/** An inclusive day range, both ends required. */
export const periodFlags = dayRangeFlags('in the app timezone');

/** Where the period flags meet the sdk's field names. */
export const periodParams = (flags: { 'date-from': string; 'date-to': string }): { dateFrom: string; dateTo: string } =>
    ({ dateFrom: flags['date-from'], dateTo: flags['date-to'] });

/** `dimension=value[,value]`: values trimmed, an empty one dropped, none left refused. */
export const parseFilter = (input: string): Promise<DimensionFilter> => {
    const filter = splitFilter(input);
    const values = filter?.values.map(value => value.trim()).filter(value => value !== '') ?? [];

    return filter === undefined || values.length === 0
        ? Promise.reject(usageError(`Expected dimension=value[,value], got "${input}".`))
        : Promise.resolve({ dimension: filter.dimension, values });
};

export const revenueBasisFlag = {
    'revenue-basis': Flags.option({
        description: 'Which revenue the revenue metrics use; the backend default applies when omitted',
        options: revenueBases,
    })(),
};
