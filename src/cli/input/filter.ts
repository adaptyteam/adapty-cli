/** One `--filter`: a dimension and the values it may take (one value is equality, several any of them). */
export type DimensionFilter = {
    dimension: string;
    values: string[];
};

/** A comma not preceded by a backslash: `\,` keeps a comma inside a value, as oclif's own delimiter does. */
const VALUE_SEPARATOR = /(?<!\\),/;

/**
 * `dimension=value[,value]` split as written: the dimension before the first `=`, trimmed; every value after it
 * as typed, `\,` turned into a comma. Undefined without `=` or without a dimension. What a product does with
 * spaces and empty values is its own rule, so its flag parser decides that.
 */
export const splitFilter = (input: string): DimensionFilter | undefined => {
    const separator = input.indexOf('=');
    const dimension = separator === -1 ? '' : input.slice(0, separator).trim();

    if (dimension === '') {
        return undefined;
    }

    const values = input.slice(separator + 1).split(VALUE_SEPARATOR).map(value => value.replaceAll('\\,', ','));

    return { dimension, values };
};
