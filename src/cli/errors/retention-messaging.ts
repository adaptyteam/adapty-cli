import { isSdkError } from '../../sdk/core/errors.js';
import { CliError, toCliError } from '../errors.js';

/**
 * A create or an update whose answer never came: the server was not reached in time or answered
 * 5xx, so nobody knows whether the write went through. The CLI never sends it again; it keeps the
 * exit code of the failure (5 or 4) and says what to do instead, also as `hint` in --json.
 */
export const withUnknownResult = (error: unknown, next: string): unknown => {
    if (!isSdkError(error)) {
        return error;
    }

    const lost = error.kind === 'network' || (error.kind === 'api' && error.status >= 500);
    const mapped = lost ? toCliError(error) : undefined;

    if (!(mapped instanceof CliError)) {
        return error;
    }

    const hint = `The result is unknown: the answer to the write was lost. ${next}`;
    const message = `${mapped.message}\n${hint}`;

    const json = { ...mapped.json, hint, message };

    return new CliError(message, mapped.exitCode, mapped.code, { cause: error, json });
};
