import { createInterface } from 'node:readline/promises';

import { CliError, exitCode } from '../../../../errors.js';

import type { Agent } from './agents.js';

/** `1,3` or `1 3` picks those; an empty answer picks all of them. Anything else is asked again. */
export const parseChoice = (answer: string, count: number): number[] | undefined => {
    const trimmed = answer.trim();

    if (trimmed === '') {
        return Array.from({ length: count }, (_, index) => index);
    }

    const picked = trimmed.split(/[\s,]+/).map(Number);

    if (picked.some(number => !Number.isInteger(number) || number < 1 || number > count)) {
        return undefined;
    }

    return [...new Set(picked)].sort((a, b) => a - b).map(number => number - 1);
};

/**
 * Asked on stderr, so the answer never mixes into what a program reads from stdout. A terminal's
 * Ctrl+C reaches readline, not the process, so the prompt turns it into the usual exit 130 itself.
 */
const ask = async <T>(
    { question, retry, signal }: { question: string; retry: string; signal: AbortSignal },
    parse: (answer: string) => T | undefined,
): Promise<T> => {
    const reader = createInterface({ input: process.stdin, output: process.stderr });
    const interrupted = new AbortController();

    reader.on('SIGINT', () => {
        interrupted.abort();
    });

    try {
        for (;;) {
            const answer = await reader.question(question, { signal: AbortSignal.any([signal, interrupted.signal]) });
            const parsed = parse(answer);

            if (parsed !== undefined) {
                return parsed;
            }

            process.stderr.write(`${retry}\n`);
        }
    } catch (error) {
        if (signal.aborted || interrupted.signal.aborted) {
            throw new CliError('Cancelled.', exitCode.cancelled, undefined, { cause: error });
        }

        throw error;
    } finally {
        reader.close();
    }
};

export const choose = async (found: readonly Agent[], signal: AbortSignal): Promise<Agent[]> => {
    const list = found.map((agent, index) => `  ${String(index + 1)}. ${agent.name}`).join('\n');

    const picked = await ask(
        {
            question: `Found:\n${list}\nInstall into which? [all] `,
            retry: `Type numbers from 1 to ${String(found.length)}, or press Enter for all.`,
            signal,
        },
        answer => parseChoice(answer, found.length),
    );

    return picked.map(index => found[index]).filter(agent => agent !== undefined);
};

/** An empty answer is a no: the question guards a command that runs code from npm. */
export const parseConsent = (answer: string): boolean | undefined => {
    const trimmed = answer.trim().toLowerCase();

    if (trimmed === '' || trimmed === 'n' || trimmed === 'no') {
        return false;
    }

    return trimmed === 'y' || trimmed === 'yes' ? true : undefined;
};

export const confirm = async (question: string, signal: AbortSignal): Promise<boolean> =>
    ask({ question: `${question} [y/N] `, retry: 'Type y or n.', signal }, parseConsent);
