import { setTimeout as delay } from 'node:timers/promises';

import { CancelledError, isAbortError } from './errors.js';

/** Time as a dependency: device flow and retry take a Clock, so tests never wait for real. */
export type Clock = {
    now(): number;
    sleep(ms: number, signal?: AbortSignal): Promise<void>;
};

export const systemClock: Clock = {
    now: () => Date.now(),

    sleep: async (ms, signal) => {
        try {
            await delay(ms, undefined, signal ? { signal } : {});
        } catch (error) {
            if (isAbortError(error)) {
                throw new CancelledError();
            }

            throw error;
        }
    },
};

export const throwIfAborted = (signal: AbortSignal | undefined): void => {
    if (signal?.aborted === true) {
        throw new CancelledError();
    }
};
