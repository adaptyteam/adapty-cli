/** Re-read a value until it settles or the time budget runs out. */
import type { Clock } from './clock.js';

/** The budget of a wait unless the caller passes its own. */
export const DEFAULT_TIMEOUT_MS = 120_000;

export type WaitOptions<T> = {
    /** Called before each pause with the latest read and the upcoming delay. */
    onPoll?: ((value: T, delayMs: number) => void) | undefined;
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
};

export type PollSpec<T> = {
    clock: Clock;
    /** `first` is the read the wait started from, for callers that wait for a change. */
    done: (value: T, first: T) => boolean;
    /** A fixed interval, or one derived from the latest read (a server's retry hint). */
    intervalMs: ((value: T) => number) | number;
    read: () => Promise<T>;
};

/**
 * Read once, then poll until `done`. Return the last read when the next pause would pass the
 * deadline: running out of time is not an error, the caller inspects the value.
 */
export const pollUntil = async <T>(spec: PollSpec<T>, options: WaitOptions<T> = {}): Promise<T> => {
    const { clock, done, intervalMs, read } = spec;
    const deadline = clock.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const first = await read();
    let value = first;

    while (!done(value, first)) {
        const delayMs = typeof intervalMs === 'number' ? intervalMs : intervalMs(value);

        if (clock.now() + delayMs > deadline) {
            return value;
        }

        options.onPoll?.(value, delayMs);
        await clock.sleep(delayMs, options.signal);

        value = await read();
    }

    return value;
};
