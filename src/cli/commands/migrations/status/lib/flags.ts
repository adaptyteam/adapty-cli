import { Errors, Flags } from '@oclif/core';

import { exitCode } from '../../../../errors.js';

const DURATION_PATTERN = /^(\d+)(m|s)?$/;

const MAX_WAIT_SECONDS = 600;

const durationHint = `Use seconds or minutes, e.g. 300s or 5m, up to ${MAX_WAIT_SECONDS}s.`;

const parseDuration = (input: string): Promise<number> => {
    const match = DURATION_PATTERN.exec(input);
    const amount = Number(match?.[1]);
    const seconds = match?.[2] === 'm' ? amount * 60 : amount;

    return Number.isFinite(seconds) && seconds >= 1 && seconds <= MAX_WAIT_SECONDS
        ? Promise.resolve(seconds * 1000)
        : Promise.reject(new Errors.CLIError(`Invalid duration \`${input}\`. ${durationHint}`, { exit: exitCode.usage }));
};

/** Parse seconds or minutes into milliseconds for the SDK. */
const duration = Flags.custom<number>({ parse: async input => parseDuration(input) });

/**
 * Keep defaults out of these flags so dependsOn can detect a missing --wait.
 * The SDK supplies the default timeout.
 */
export const waitFlags = {
    timeout: duration({
        dependsOn: ['wait'],
        description: 'Polling budget with --wait: 1-600s, default 120s (e.g. 300, 300s, 5m); in-flight requests may take longer',
        helpValue: 'DURATION',
    }),
    wait: Flags.boolean({
        description: 'Poll for a revision or state change, then return the latest response',
    }),
};
