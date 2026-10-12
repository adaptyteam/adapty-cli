import { usageError } from '../errors.js';

/** One `--filter`: a dimension and the values it may take (one value is equality, several any of them). */
export type DimensionFilter = {
    dimension: string;
    values: string[];
};

/** A comma not preceded by a backslash: `\,` keeps a comma inside a value, as oclif's own delimiter does. */
const VALUE_SEPARATOR = /(?<!\\),/;

/** `dimension=value[,value]`, the `--filter` of every analytics product. */
export const parseFilter = (input: string): Promise<DimensionFilter> => {
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
