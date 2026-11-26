import { isSdkError } from '../../sdk/core/errors.js';
import { CliError, toCliError } from '../errors.js';

import { withUnknownResult } from './unknown-result.js';

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

/** The answer of an adjustment whose key still has a write in progress. */
const IN_FLIGHT = 'idempotency_in_flight';

/**
 * Each failure of an adjustment after its send names the key it was sent with, also as `idempotency_key` in
 * --json: a lost answer, a Ctrl+C during the send and an in-flight key say to repeat with that key, so that a repeat
 * never writes twice; a refusal of the server wrote nothing, and its key is free again.
 */
export const withAdjustmentKey = (error: unknown, key: string): unknown => {
    const repeat = `--idempotency-key ${key}`;

    const again = `Repeat the same command with ${repeat} within one hour: the server then gives the answer of the first `
        + 'write, or makes the write once. Never repeat with a new key: that can write the coins twice.';

    const lost = withUnknownResult(error, again, { idempotency_key: key });

    if (lost !== error || !isSdkError(error)) {
        return lost;
    }

    const mapped = toCliError(error);

    if (!(mapped instanceof CliError)) {
        return error;
    }

    const inFlight = error.kind === 'api' && error.code === IN_FLIGHT;

    // The send can be cancelled after the server got the write: its result is as unknown as a lost answer
    const cancelled = error.kind === 'cancelled';

    let next: string | undefined;

    if (inFlight) {
        next = `The first write with this key is still in progress. Wait a few seconds, then repeat the same command with ${repeat}.`;
    } else if (cancelled) {
        next = `The result is unknown: the write was cancelled during its send and can have passed. ${again}`;
    }

    const message = `${mapped.message}\n${next ?? `Idempotency key: ${key}.`}`;

    const json = { ...mapped.json, ...(next === undefined ? {} : { hint: next }), message };

    const named = new CliError(message, mapped.exitCode, mapped.code, { cause: error, json });

    Object.assign(named.json, { idempotency_key: key });

    return named;
};
