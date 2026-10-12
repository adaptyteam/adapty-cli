import type { Issue } from './errors.js';

/**
 * Days as the backends take them: `YYYY-MM-DD`, an inclusive range of two. Shared by every product that
 * reads a day range, so a range is checked, and refused, in the same words everywhere.
 */

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
 * Both ends real days, the end not before the start. `paths` names the two input fields, so the adapter
 * can name the two flags the user typed.
 */
export const validateDayRange = (from: string, to: string, paths: { from: string; to: string }): Issue[] => {
    const issues: Issue[] = [];
    const fromValid = isIsoDate(from);
    const toValid = isIsoDate(to);

    if (!fromValid) {
        issues.push({ message: 'must be a date in YYYY-MM-DD form', path: paths.from });
    }

    if (!toValid) {
        issues.push({ message: 'must be a date in YYYY-MM-DD form', path: paths.to });
    }

    // ISO days order as strings, but only two real days are worth comparing
    if (fromValid && toValid && to < from) {
        issues.push({ message: 'must not be before the start date', path: paths.to });
    }

    return issues;
};
