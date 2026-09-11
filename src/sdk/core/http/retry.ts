import { throwIfAborted } from '../clock.js';

import type { Clock } from '../clock.js';

export type RetryPolicy = {
    /** Total attempts, the first one included. */
    attempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
};

export const defaultRetryPolicy: RetryPolicy = { attempts: 3, baseDelayMs: 500, maxDelayMs: 8000 };

/** false: do not retry. An object: retry, optionally after the delay the server suggested. */
export type RetryDecision = false | { delayMs?: number | undefined };

export type RetryAttempt = {
    /** Number of the failed attempt, starting at 1. */
    attempt: number;
    delayMs: number;
    error: unknown;
};

export type RetryOptions = {
    clock: Clock;
    /** Called before the pause. The sdk never prints: cli warns, MCP stays quiet. */
    onRetry?: ((info: RetryAttempt) => void) | undefined;
    policy: RetryPolicy;
    shouldRetry: (error: unknown, attempt: number) => RetryDecision;
    signal?: AbortSignal | undefined;
};

export const retry = async <T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> => {
    const { clock, policy, signal } = options;

    for (let attempt = 1; ; attempt += 1) {
        throwIfAborted(signal);

        try {
            return await fn();
        } catch (error) {
            const decision = attempt < policy.attempts ? options.shouldRetry(error, attempt) : false;

            if (decision === false) {
                throw error;
            }

            const delayMs = decision.delayMs ?? backoffDelay(policy, attempt);

            options.onRetry?.({ attempt, delayMs, error });
            await clock.sleep(delayMs, signal);
        }
    }
};

/** Exponential backoff without jitter: deterministic tests are worth more than spread here. */
const backoffDelay = (policy: RetryPolicy, attempt: number): number =>
    Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
