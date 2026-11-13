import { CliError, exitCode, toCliError } from '../../../../errors.js';

import type { OfferPushResult } from '../../../../../sdk/adapty/index.js';

/**
 * A failure of a repeat keeps saying that the pushes before it went through: the store may already hold the
 * offer in some regions. Before the first answer nothing is known to be written, so the error stays as it is.
 */
export const afterPush = (error: unknown, answered: readonly OfferPushResult[]): Error => {
    const failure = toCliError(error);
    const last = answered.at(-1);

    if (last === undefined) {
        return failure;
    }

    const created = answered.reduce((sum, result) => sum + result.store_result.created, 0);
    const exit = failure instanceof CliError ? failure.exitCode : 1;
    const done = `The push created the offer in ${created} ${created === 1 ? 'region' : 'regions'}`;

    const message = exit === exitCode.cancelled
        ? `${done}, but the next push was cancelled. Run the same command again to finish: it skips the regions already created.`
        : `${done}, but the next push failed: ${failure.message}\nRun the same command again to finish: it skips the regions already created.`;

    const json = failure instanceof CliError ? failure.json : { message: failure.message };

    return new CliError(message, exit, failure instanceof CliError ? failure.code : undefined, {
        cause: error,
        json: {
            ...json,
            attempts: answered.length,
            message,
            offer: last.offer,
            pushed: true,
            store_result: last.store_result,
        },
    });
};
