import type { Issue } from '../../core/errors.js';

/** Whether the dimension exists is the catalog's knowledge, so the server checks that. */
export const validateValues = (dimension: string): Issue[] =>
    (dimension.trim() === '' ? [{ message: 'must not be empty', path: 'dimension' }] : []);
