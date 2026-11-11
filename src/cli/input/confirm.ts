import { Flags } from '@oclif/core';

import { CliError, exitCode } from '../errors.js';

import { ask } from './prompt.js';

import type { PromptStreams } from './prompt.js';

/** Spread into a command that does something that cannot be undone: `static flags = { ...yesFlag }`. */
export const yesFlag = {
    yes: Flags.boolean({
        char: 'y',
        description: 'Do it without asking; required when the output is piped or --json is used',
    }),
};

export type ConfirmOptions = {
    /** What the action does to real users, in words: shown before the question and in a refusal. */
    effect: string;
    /** `this.interactive` of the command: stdout is a terminal and there is no --json. */
    interactive: boolean;
    signal: AbortSignal;
    /** Tests give their own streams; a command never does. */
    streams?: PromptStreams | undefined;
    yes: boolean;
};

const isYes = (answer: string): boolean => /^y(es)?$/i.test(answer.trim());

const isTerminal = (stream: NodeJS.ReadableStream): boolean => (stream as { isTTY?: boolean }).isTTY === true;

/**
 * Whether a person can answer a question: the command is interactive (stdout is a terminal, no
 * --json) and stdin is a terminal too. A command that must refuse in its own words when nobody can
 * answer asks this first, so it and `confirmAction` never disagree.
 */
export const canAsk = ({ interactive, streams }: Pick<ConfirmOptions, 'interactive' | 'streams'>): boolean =>
    interactive && isTerminal(streams?.input ?? process.stdin);

/**
 * The one confirmation of an action that cannot be undone. Returns when the action may go on and
 * throws when it may not, so a command writes one line before its request:
 *
 *   --yes                          goes on
 *   a person at a terminal         the effect, then `Apply? [y/N]`: y or yes goes on, anything else
 *                                  is exit 1 ("Cancelled, nothing was sent."), Ctrl+C is exit 130
 *   --json, a pipe, no terminal    exit 6 `confirm_required` with the effect in the message: nobody
 *                                  can answer, so nothing is sent unless the caller says --yes
 */
export const confirmAction = async ({ effect, interactive, signal, streams, yes }: ConfirmOptions): Promise<void> => {
    if (yes) {
        return;
    }

    if (!canAsk({ interactive, streams })) {
        throw new CliError(`${effect}\n\nRe-run with --yes to do it.`, exitCode.confirmRequired, 'confirm_required');
    }

    const input = streams?.input ?? process.stdin;
    const output = streams?.output ?? process.stderr;

    output.write(`${effect}\n`);

    const answer = await ask({ question: 'Apply? [y/N] ', signal, streams: { input, output } }, answerText => answerText);

    if (!isYes(answer)) {
        throw new CliError('Cancelled, nothing was sent.', 1);
    }
};
