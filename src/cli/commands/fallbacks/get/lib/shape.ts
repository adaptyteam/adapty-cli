import { CliError, exitCode } from '../../../../errors.js';

import { createDepthScanner } from './json-depth.js';

/**
 * The answer is not a fallback file: a proxy page, a maintenance notice, a truncated body. Exit 4, as
 * for any answer the server should not have given; the SDK would reject such a file at startup.
 */
export const invalidResponse = (reason: string): CliError => new CliError(
    `The server did not answer with a fallback file: ${reason}. Nothing was saved; try again later.`,
    exitCode.api,
    'fallback_invalid_response',
);

/**
 * The media type alone: `application/json; charset=utf-8` is still JSON. A refused answer has its body
 * cancelled, or the connection would stay open, unread, until the process exits.
 */
export const checkContentType = async (
    { body, headers }: { body: ReadableStream<Uint8Array>; headers: Headers },
): Promise<void> => {
    const type = headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

    if (type !== 'application/json') {
        // The refusal is the error worth reporting, not a failure to cancel what nobody reads
        await body.cancel().catch(() => undefined);

        throw invalidResponse(`content type ${type ?? 'missing'}, expected application/json`);
    }
};

/**
 * Passes the bytes through unchanged while checking, without parsing or holding the body, that it is
 * one whole JSON object (`createDepthScanner`): a body cut short after any inner `}` is refused at its
 * end. Leading whitespace is held back, so nothing is passed on before the first byte has been checked.
 * A cut is known only at the end: a consumer that cannot take bytes back (stdout) keeps what it got.
 *
 * A refusal leaves the loop by a throw, and leaving a `for await` over a ReadableStream cancels it:
 * the connection closes there and then.
 */
export async function* checkShape(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
    const scanner = createDepthScanner();
    const leading: Uint8Array[] = [];

    for await (const chunk of source) {
        const wasStarted = scanner.started;
        const reason = scanner.push(chunk);

        if (reason !== undefined) {
            throw invalidResponse(reason);
        }

        if (!scanner.started) {
            leading.push(chunk);
            continue;
        }

        if (!wasStarted) {
            yield* leading;
        }

        yield chunk;
    }

    const reason = scanner.end();

    if (reason !== undefined) {
        throw invalidResponse(reason);
    }
}
