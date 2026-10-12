import { usageError } from '../errors.js';

/** One `--filter`: a dimension and the values it may take (one value is equality, several any of them). */
export type DimensionFilter = {
    dimension: string;
    values: string[];
};

/** A comma not preceded by a backslash: `\,` keeps a comma inside a value, as oclif's own delimiter does. */
const VALUE_SEPARATOR = /(?<!\\),/;

const splitValues = (text: string): string[] => text.split(VALUE_SEPARATOR).map(value => value.replaceAll('\\,', ','));

/** The dimension before the first `=`; an input without `=` or without a dimension is refused by the caller. */
const dimensionOf = (input: string): { dimension: string; rest: string } | undefined => {
    const separator = input.indexOf('=');
    const dimension = separator === -1 ? '' : input.slice(0, separator).trim();

    return dimension === '' ? undefined : { dimension, rest: input.slice(separator + 1) };
};

/** `dimension=value[,value]`, the attribution `--filter`: values trimmed, an empty one dropped, none left refused. */
export const parseFilter = (input: string): Promise<DimensionFilter> => {
    const parts = dimensionOf(input);
    const values = parts === undefined ? [] : splitValues(parts.rest).map(value => value.trim()).filter(value => value !== '');

    return parts === undefined || values.length === 0
        ? Promise.reject(usageError(`Expected dimension=value[,value], got "${input}".`))
        : Promise.resolve({ dimension: parts.dimension, values });
};

/**
 * `dimension=value[,value]` with every value exactly as written: the analytics `--filter`. An empty value is a
 * value, the one a text grouping gives its "No Data" group, so `country=` keeps that group, as the dashboard does.
 */
export const parseExactFilter = (input: string): Promise<DimensionFilter> => {
    const parts = dimensionOf(input);

    return parts === undefined
        ? Promise.reject(usageError(`Expected dimension=value[,value] (an empty value is a "No Data" group), got "${input}".`))
        : Promise.resolve({ dimension: parts.dimension, values: splitValues(parts.rest) });
};
