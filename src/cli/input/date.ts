import { usageError } from '../errors.js';

/** The shape only: whether the day exists, and the order of two days, are not decided here. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A `--date-from` / `--date-to` parser, shared by the products that take a day range. */
export const dayParser = (input: string): Promise<string> => (ISO_DAY.test(input)
    ? Promise.resolve(input)
    : Promise.reject(usageError('Dates must be written as YYYY-MM-DD.')));
