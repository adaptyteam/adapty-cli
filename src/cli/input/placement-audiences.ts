import { Flags } from '@oclif/core';

import { usageError } from '../errors.js';

import type { Issue } from '../../sdk/core/errors.js';
import type { CliError } from '../errors.js';

/** The one way past the check of `placements create` and `placements update`. */
export const allowTestChangeFlag = {
    'allow-test-change': Flags.boolean({
        default: false,
        description:
            'Allow a write that stops, starts or moves an A/B test. Without it, the command refuses '
            + 'and sends nothing when the new audiences stop a running test (with no winner), start a test '
            + 'or start it again on other segments. A change of priority only is always allowed.',
    }),
};

/**
 * The refusal for a write that would stop, start or move a test: exit 2 in human and --json mode
 * alike (hence a CliError, not `this.error`), one line per affected test.
 */
export const testChangeRefusal = (changes: readonly Issue[]): CliError => usageError(
    'Refused, nothing was sent: this write changes A/B tests. Re-run with --allow-test-change '
    + `to apply it.\n${changes.map(change => `  ${change.message}`).join('\n')}`,
);
