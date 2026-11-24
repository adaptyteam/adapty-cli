import { isSdkError } from '../../sdk/core/errors.js';
import { CliError, toCliError } from '../errors.js';

import { withUnknownResult } from './hints.js';

/**
 * The failures of a currency write that need a next step: a 409 (the currency changed after its read) and a lost
 * answer (the result is unknown). No write is repeated by the CLI, so a repeat by the caller can meet the result
 * of the first write: a 409, a 404 or the 400 of a used code. The next step is a read, in both cases.
 */
const CONFLICT = 'virtual_currency_conflict';

/** The next step after a 409 of a write that asks and takes a token: show the change again, then the new token. */
const ASK_AGAIN = 'show the user what changed and ask again; then write with the new updated_at';

const withConflictHint = (error: unknown, read: string, again: string): unknown => {
    if (!isSdkError(error) || error.kind !== 'api' || error.code !== CONFLICT) {
        return error;
    }

    const mapped = toCliError(error);

    if (!(mapped instanceof CliError)) {
        return error;
    }

    const hint = `The currency changed after it was read, and nothing was written. Read it again with \`${read}\`, `
        + `${again}. After a network error or a 5xx, the change can be your own first write: a repeat can give 409, `
        + '404 or the 400 of a used code although the first write passed.';

    const message = `${mapped.message}\n${hint}`;

    const json = { ...mapped.json, hint, message };

    return new CliError(message, mapped.exitCode, mapped.code, { cause: error, json });
};

/**
 * `read` is the command that reads the state after the failure, with the ids of this write in it; `again` is the
 * next step after a 409, when the write does not ask and take a token.
 */
export const withWriteHints = (error: unknown, read: string, again = ASK_AGAIN): unknown => withUnknownResult(
    withConflictHint(error, read, again),
    `Do not repeat the write before you read the state with \`${read}\`: the write can have passed, and a repeat can `
    + 'then give 409, 404 or the 400 of a used code.',
);
