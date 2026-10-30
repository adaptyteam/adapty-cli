import { CliError, exitCode, toCliError } from '../../../../errors.js';

/** A failure after the save keeps saying the save went through, with the exit code of what failed. */
export const afterSave = (error: unknown, savedRows: number): CliError => {
    const failure = toCliError(error);

    if (failure instanceof CliError && failure.json.saved === true) {
        return failure;
    }

    const exit = failure instanceof CliError ? failure.exitCode : 1;

    const message = exit === exitCode.cancelled
        ? 'The prices were saved, but the wait was cancelled; `product-prices list` shows the sync.'
        : `The prices were saved, but reading the sync failed: ${failure.message}`;

    const json = failure instanceof CliError ? failure.json : { message: failure.message };

    return new CliError(message, exit, failure instanceof CliError ? failure.code : undefined, {
        cause: error,
        json: { ...json, message, saved: true, saved_rows: savedRows },
    });
};
