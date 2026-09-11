import { ValidationError } from './errors.js';

import type { Issue } from './errors.js';

/**
 * Turns a rule's problems into a throw — the only place that does. Rules return lists instead of
 * throwing, so a table test walks them without an environment and the user sees every problem at
 * once.
 *
 * Call it from an `async` method: a broken rule then arrives as a rejected promise, like a network
 * failure, instead of a throw the caller has to handle separately.
 */
export const assertValid = (issues: readonly Issue[]): void => {
    if (issues.length > 0) {
        throw new ValidationError(issues);
    }
};
