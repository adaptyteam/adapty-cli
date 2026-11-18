import { NetworkError } from '../../../../../sdk/core/errors.js';
import { CliError, toCliError } from '../../../../errors.js';

/** undici's code for "no response headers within headersTimeout" (300 s by default in Node's fetch). */
const HEADERS_TIMEOUT = 'UND_ERR_HEADERS_TIMEOUT';

/** fetch wraps undici's error in a TypeError('fetch failed'), and the sdk wraps that again: walk the chain. */
const hasCode = (error: unknown, code: string): boolean => {
    for (let current = error, hops = 0; current instanceof Object && hops < 8; hops += 1) {
        if ('code' in current && current.code === code) {
            return true;
        }

        current = 'cause' in current ? current.cause : undefined;
    }

    return false;
};

/**
 * The server builds the whole file before it sends the headers, and for a large app that can take
 * longer than fetch waits for them. The usual exit 5 and --json error, but with a text that says the
 * server was reached and was slow, not that the connection failed. Any other error passes through.
 */
export const explainHeadersTimeout = (error: unknown): unknown => {
    if (!(error instanceof NetworkError) || !hasCode(error.cause, HEADERS_TIMEOUT)) {
        return error;
    }

    const mapped = toCliError(error);

    if (!(mapped instanceof CliError)) {
        return mapped;
    }

    const message = 'The server did not answer in 300 s. It builds the file before it answers; a large app can take '
        + 'minutes. Try again later.';

    // The --json error keeps its network_error shape, with this text in place of "Could not reach"
    return new CliError(message, mapped.exitCode, typeof mapped.code === 'string' ? mapped.code : undefined, {
        cause: error,
        json: { ...mapped.json, message },
    });
};
