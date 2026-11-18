import { CancelledError, isAbortError, NetworkError } from '../errors.js';

/** Reading a response body, with every failure mapped to an sdk error. */

/** fetch rejects or a body read fails: cancelled when the caller aborted, else a network failure. */
export const transportError = (url: string, signal: AbortSignal | undefined, error: unknown): Error => {
    if (signal?.aborted === true || isAbortError(error)) {
        return new CancelledError();
    }

    return new NetworkError(url, error);
};

/**
 * fetch resolves at the headers; reading the body can still fail or be cancelled. Kept apart from
 * the caller's onResponse callback, which runs before it and outside this conversion.
 */
export const readPayload = async (
    response: Response,
    url: string,
    signal: AbortSignal | undefined,
): Promise<unknown> => {
    try {
        return await readBody(response);
    } catch (error) {
        throw transportError(url, signal, error);
    }
};

const readBody = async (response: Response): Promise<unknown> => {
    if (response.status === 204) {
        return undefined;
    }

    const text = await response.text();

    if (text.length === 0) {
        return undefined;
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
};

/** The body as it arrives, chunk by chunk, with a broken read turned into the same sdk errors. */
export const guardBody = (
    body: null | ReadableStream<Uint8Array>,
    url: string,
    signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> => {
    if (body === null) {
        return new ReadableStream({
            start(controller) {
                controller.close();
            },
        });
    }

    const reader = body.getReader();

    return new ReadableStream<Uint8Array>({
        cancel: reason => reader.cancel(reason),
        async pull(controller) {
            try {
                const chunk = await reader.read();

                if (chunk.done) {
                    controller.close();
                } else {
                    controller.enqueue(chunk.value);
                }
            } catch (error) {
                controller.error(transportError(url, signal, error));
            }
        },
    });
};
