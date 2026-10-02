import type { Issue } from './errors.js';

/** The `YYYY-MM-DD` shape alone, shared with the adapter's date flag parser. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The shape alone lets 2026-02-30 through; a round trip through Date does not. */
const isIsoDate = (value: string): boolean => {
    if (!ISO_DATE.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

/**
 * An inclusive day range, both ends real days and in order. Every product that reads a period
 * refuses a bad one the same way, so the rule lives here rather than in one of them.
 */
export const validateDateRange = (input: { dateFrom: string; dateTo: string }): Issue[] => {
    const issues: Issue[] = [];
    const fromValid = isIsoDate(input.dateFrom);
    const toValid = isIsoDate(input.dateTo);

    if (!fromValid) {
        issues.push({ message: 'must be a date in YYYY-MM-DD form', path: 'dateFrom' });
    }

    if (!toValid) {
        issues.push({ message: 'must be a date in YYYY-MM-DD form', path: 'dateTo' });
    }

    // ISO days order as strings, but only two real days are worth comparing
    if (fromValid && toValid && input.dateTo < input.dateFrom) {
        issues.push({ message: 'must not be before the start date', path: 'dateTo' });
    }

    return issues;
};
