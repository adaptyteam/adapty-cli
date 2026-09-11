import { throwIfAborted } from '../clock.js';
import { CancelledError, DeviceFlowDeniedError, DeviceFlowExpiredError } from '../errors.js';

import type { Clock } from '../clock.js';

export type DeviceCode = {
    deviceCode: string;
    expiresInSec: number;
    intervalSec: number;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string | undefined;
};

export type PollResult<TToken>
    = | { status: 'authorized'; token: TToken }
        | { status: 'denied' }
        | { status: 'expired' }
        | { status: 'pending' }
        | { status: 'slow_down' };

/**
 * The device flow port (RFC 8628) — all the orchestration below knows. What sits inside a token
 * (for Adapty, an access_token plus the user) is the port's business.
 */
export type DeviceAuthApi<TToken> = {
    pollToken(deviceCode: string): Promise<PollResult<TToken>>;
    requestDeviceCode(): Promise<DeviceCode>;
};

/** RFC 8628, 3.5: on slow_down the interval grows by 5 seconds. */
const SLOW_DOWN_STEP_MS = 5000;
const DEFAULT_MIN_INTERVAL_MS = 5000;
const DEFAULT_MAX_CONSECUTIVE_ERRORS = 10;

export type DeviceFlowDeps = {
    clock: Clock;
    maxConsecutiveErrors?: number | undefined;
    /** Do not poll faster than this, even if the server allows it. */
    minIntervalMs?: number | undefined;
    /** Show the code and the link to the user. Sdk prints nothing itself. */
    onCode: (code: DeviceCode) => void;
    /** One poll failed (network, odd answer). The flow goes on up to maxConsecutiveErrors. */
    onTransientError?: ((error: unknown, consecutive: number) => void) | undefined;
    signal?: AbortSignal | undefined;
};

/**
 * Device flow orchestration with every effect kept outside: the network behind the api port, time
 * behind clock, cancellation behind signal. That is what makes expiry, slow_down, poll failures
 * and Ctrl+C unit-testable.
 */
export const runDeviceFlow = async <TToken>(api: DeviceAuthApi<TToken>, deps: DeviceFlowDeps): Promise<TToken> => {
    const { clock, signal } = deps;
    const maxConsecutiveErrors = deps.maxConsecutiveErrors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;

    throwIfAborted(signal);

    const code = await api.requestDeviceCode();

    deps.onCode(code);

    const deadline = clock.now() + code.expiresInSec * 1000;
    let intervalMs = Math.max(code.intervalSec * 1000, deps.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS);
    let consecutiveErrors = 0;

    for (;;) {
        if (clock.now() >= deadline) {
            throw new DeviceFlowExpiredError();
        }

        await clock.sleep(intervalMs, signal);
        throwIfAborted(signal);

        let result: PollResult<TToken>;

        try {
            result = await api.pollToken(code.deviceCode);
            consecutiveErrors = 0;
        } catch (error) {
            if (error instanceof CancelledError) {
                throw error;
            }

            consecutiveErrors += 1;

            if (consecutiveErrors >= maxConsecutiveErrors) {
                throw error;
            }

            deps.onTransientError?.(error, consecutiveErrors);
            continue;
        }

        switch (result.status) {
            case 'authorized': {
                return result.token;
            }

            case 'pending': {
                break;
            }

            case 'slow_down': {
                intervalMs += SLOW_DOWN_STEP_MS;
                break;
            }

            case 'expired': {
                throw new DeviceFlowExpiredError();
            }

            case 'denied': {
                throw new DeviceFlowDeniedError();
            }
        }
    }
};
