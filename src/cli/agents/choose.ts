import { createInterface } from 'node:readline/promises';

import { CliError, exitCode } from '../errors.js';

import type { Agent } from './catalog.js';

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
export const choose = async (found: readonly Agent[], signal: AbortSignal): Promise<Agent[]> => {
    const reader = createInterface({ input: process.stdin, output: process.stderr });
    const interrupted = new AbortController();
    const list = found.map((agent, index) => `  ${String(index + 1)}. ${agent.name}`).join('\n');

    reader.on('SIGINT', () => {
        interrupted.abort();
    });

    try {
        for (;;) {
            const answer = await reader.question(`Found:\n${list}\nInstall into which? [all] `, {
                signal: AbortSignal.any([signal, interrupted.signal]),
            });

            const picked = parseChoice(answer, found.length);

            if (picked !== undefined) {
                return picked.map(index => found[index]).filter(agent => agent !== undefined);
            }

            process.stderr.write(`Type numbers from 1 to ${String(found.length)}, or press Enter for all.\n`);
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
