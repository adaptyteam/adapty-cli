import { createInterface } from 'node:readline/promises';

import { CliError, exitCode } from '../errors.js';

/** Where a prompt reads and writes: the process streams, unless a test hands over its own. */
export type PromptStreams = {
    input: NodeJS.ReadableStream;
    output: NodeJS.WritableStream;
};

/**
 * Asked on stderr, so the answer never mixes into what a program reads from stdout. A terminal's
 * Ctrl+C reaches readline, not the process, so the prompt turns it into the usual exit 130 itself.
 * An answer that `parse` does not take is asked again. The end of the input (Ctrl+D) is no answer:
 * exit 1, not a prompt that never returns.
 */
export const ask = async <T>(
    { question, retry, signal, streams }: {
        question: string;
        retry?: string;
        signal: AbortSignal;
        streams?: PromptStreams;
    },
    parse: (answer: string) => T | undefined,
): Promise<T> => {
    const { input, output } = streams ?? { input: process.stdin, output: process.stderr };
    const reader = createInterface({ input, output });
    const interrupted = new AbortController();

    const ended = new AbortController();

    reader.on('SIGINT', () => {
        interrupted.abort();
    });

    reader.once('close', () => {
        ended.abort();
    });

    try {
        for (;;) {
            const stop = AbortSignal.any([signal, interrupted.signal, ended.signal]);
            const answer = await reader.question(question, { signal: stop });
            const parsed = parse(answer);

            if (parsed !== undefined) {
                return parsed;
            }

            if (retry !== undefined) {
                output.write(`${retry}\n`);
            }
        }
    } catch (error) {
        if (signal.aborted || interrupted.signal.aborted) {
            throw new CliError('Cancelled.', exitCode.cancelled, undefined, { cause: error });
        }

        if (ended.signal.aborted) {
            throw new CliError('Cancelled: no answer.', 1, undefined, { cause: error });
        }

        throw error;
    } finally {
        reader.close();
    }
};
