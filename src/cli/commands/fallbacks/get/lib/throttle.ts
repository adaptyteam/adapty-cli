import { ApiError } from '../../../../../sdk/core/errors.js';
import { CliError, toCliError } from '../../../../errors.js';

/** The cause of a 429 on this route: a limit on downloads, not a busy server. */
const LIMIT = 'The server allows 30 fallback downloads per hour for each app, shared by all tokens of the app.';

/**
 * A 429 as the usual exit 4 with the usual --json error (`retry_after_seconds` included), but with a
 * human text that says when to ask again: this command never retries, so the wait is the caller's to
 * honour. Any other error passes through untouched.
 */
export const explainThrottle = (error: unknown): unknown => {
    if (!(error instanceof ApiError) || error.status !== 429) {
        return error;
    }

    const mapped = toCliError(error);

    if (!(mapped instanceof CliError)) {
        return mapped;
    }

    const wait = mapped.json.retry_after_seconds;

    const when = typeof wait === 'number'
        ? `Wait at least ${wait} second${wait === 1 ? '' : 's'} (the server's Retry-After) before you run it again.`
        : 'Wait a few minutes before you run it again.';

    return new CliError(
        `${mapped.message}\n${LIMIT} This command does not retry. ${when}`,
        mapped.exitCode,
        typeof mapped.code === 'string' ? mapped.code : undefined,
        { cause: error, json: mapped.json },
    );
};
