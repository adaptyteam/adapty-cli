import { CliError, exitCode } from '../errors.js';

import { canAsk, confirmAction } from './confirm.js';

import type { VirtualCurrencyDetail } from '../../sdk/adapty/index.js';

export type TokenWrite = {
    /** `this.interactive` of the command. */
    interactive: boolean;
    /** The question, from the currency read just before. */
    question: (currency: VirtualCurrencyDetail) => string;
    /** The read of the currency, made only when the question is needed. */
    read: () => Promise<VirtualCurrencyDetail>;
    /** The line under the question when nobody can answer it: it names the token of the read. */
    refusal: (currency: VirtualCurrencyDetail) => string;
    signal: AbortSignal;
    token: number | undefined;
    yes: boolean;
};

/**
 * The confirmation of a mapping write, and the token it sends. With --yes nobody reads the currency for the
 * user, so the token of the read the user saw is the proof of what is replaced: no token, exit 6 and no request.
 * Else the command reads the currency for the question: with nobody to answer it, exit 6 names the token of
 * that read; at a terminal a yes sends the token flag when it is given (the `updated_at` the user saw), else
 * the one of the read.
 */
export const confirmTokenWrite = async (write: TokenWrite): Promise<number> => {
    if (write.yes) {
        if (write.token === undefined) {
            throw new CliError(
                '--expected-updated-at is required with --yes: give the updated_at of the currency read that the user saw '
                + '(`virtual-currencies get --json`). Nothing was written.',
                exitCode.confirmRequired,
                'confirm_required',
            );
        }

        return write.token;
    }

    const currency = await write.read();
    const question = write.question(currency);

    if (!canAsk({ interactive: write.interactive })) {
        throw new CliError(`${question}\n${write.refusal(currency)}`, exitCode.confirmRequired, 'confirm_required');
    }

    await confirmAction({ effect: question, interactive: write.interactive, signal: write.signal, yes: false });

    return write.token ?? currency.updated_at;
};
