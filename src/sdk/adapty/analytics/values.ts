import type { Issue } from '../../core/errors.js';

/** The values one filter takes for an app: what `filters.<dimension>` accepts, and the `key` of its groups. */
export type FilterValuesInput = {
    appId: string;
    /** A filter key, as the catalog `dimensions` lists it; the backend refuses any other. */
    dimension: string;
};

/** `group` is the parent in the dashboard list (the region of a country, ...); null at the top level. */
export type FilterValue = {
    group: null | string;
    label: string;
    value: string;
};

export type FilterValuesResponse = {
    data: FilterValue[];
    meta: { dimension: string };
};

export const validateFilterValues = (input: FilterValuesInput): Issue[] =>
    (input.dimension.trim() === '' ? [{ message: 'must not be empty', path: 'dimension' }] : []);
