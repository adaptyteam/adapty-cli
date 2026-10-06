import { CliError, exitCode } from '../../../../errors.js';

const OPEN_BRACE = 0x7B;
const CLOSE_BRACE = 0x7D;

/** JSON's own whitespace: space, tab, line feed, carriage return. */
const isWhitespace = (byte: number): boolean => byte === 0x20 || byte === 0x09 || byte === 0x0A || byte === 0x0D;

/**
 * The answer is not a fallback file: a proxy page, a maintenance notice, a truncated body. Exit 4, as
 * for any answer the server should not have given; the SDK would reject such a file at startup.
 */
export const invalidResponse = (reason: string): CliError => new CliError(
    `The server did not answer with a fallback file: ${reason}. Nothing was saved; try again later.`,
    exitCode.api,
    'fallback_invalid_response',
);

/** The media type alone: `application/json; charset=utf-8` is still JSON. */
export const checkContentType = (headers: Headers): void => {
    const type = headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

    if (type !== 'application/json') {
        throw invalidResponse(`content type ${type ?? 'missing'}, expected application/json`);
    }
};

const firstSignificant = (chunk: Uint8Array): number | undefined => chunk.find(byte => !isWhitespace(byte));

const lastSignificant = (chunk: Uint8Array): number | undefined => chunk.findLast(byte => !isWhitespace(byte));

/**
 * Passes the bytes through unchanged while checking the only parts of the file that can be checked
 * without parsing it: the first non-whitespace byte is `{`, the last is `}`. Leading whitespace is
 * held back, so nothing is passed on before the first byte has been checked. The last byte is known
 * only at the end: a consumer that cannot take bytes back (stdout) keeps what it got.
 */
export async function* checkShape(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
    const leading: Uint8Array[] = [];
    let started = false;
    let last: number | undefined;

    for await (const chunk of source) {
        last = lastSignificant(chunk) ?? last;

        if (!started) {
            const first = firstSignificant(chunk);

            if (first === undefined) {
                leading.push(chunk);
                continue;
            }

            if (first !== OPEN_BRACE) {
                throw invalidResponse('the body does not start with {');
            }

            started = true;
            yield* leading;
        }

        yield chunk;
    }

    if (!started || last !== CLOSE_BRACE) {
        throw invalidResponse(started ? 'the body does not end with }' : 'the body is empty');
    }
}
