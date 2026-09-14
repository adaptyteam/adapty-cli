import { expect } from 'chai';

import { runDeviceFlow } from '../../../../src/sdk/core/auth/device-flow.js';
import { CancelledError, DeviceFlowDeniedError, DeviceFlowExpiredError, NetworkError } from '../../../../src/sdk/core/errors.js';
import { createFakeClock } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

import type { DeviceAuthApi, DeviceCode, PollResult } from '../../../../src/sdk/core/auth/device-flow.js';

const code: DeviceCode = {
    deviceCode: 'dc_1',
    expiresInSec: 12,
    intervalSec: 5,
    userCode: 'WDJB-MJHT',
    verificationUri: 'https://example.com/activate',
    verificationUriComplete: undefined,
};

type Step = Error | PollResult<string>;

/** A port with scripted poll answers. The last step repeats forever; an Error is thrown. */
const fakeApi = (steps: Step[], onPoll?: () => void) => {
    let polls = 0;

    const api: DeviceAuthApi<string> = {
        pollToken: () => {
            polls += 1;
            onPoll?.();

            const step = steps[Math.min(polls, steps.length) - 1] ?? { status: 'pending' };

            return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
        },

        requestDeviceCode: () => Promise.resolve(code),
    };

    return { api, polls: () => polls };
};

const silent = { onCode: () => undefined };

describe('runDeviceFlow', () => {
    it('shows the code, waits the interval between polls and returns the token', async () => {
        const clock = createFakeClock();
        const shown: string[] = [];
        const { api, polls } = fakeApi([{ status: 'pending' }, { status: 'authorized', token: 'tok' }]);

        const token = await runDeviceFlow(api, { clock, onCode: c => shown.push(c.userCode) });

        expect(token).to.equal('tok');
        expect(shown).to.deep.equal(['WDJB-MJHT']);
        expect(polls()).to.equal(2);
        expect(clock.sleeps).to.deep.equal([5000, 5000]);
    });

    it('never polls faster than minIntervalMs, even when the server allows it', async () => {
        const clock = createFakeClock();
        const { api } = fakeApi([{ status: 'authorized', token: 'tok' }]);

        api.requestDeviceCode = () => Promise.resolve({ ...code, intervalSec: 1 });
        await runDeviceFlow(api, { clock, ...silent });

        expect(clock.sleeps).to.deep.equal([5000]);
    });

    it('grows the interval by 5 seconds on slow_down', async () => {
        const clock = createFakeClock();
        const { api } = fakeApi([{ status: 'slow_down' }, { status: 'pending' }, { status: 'authorized', token: 'tok' }]);

        api.requestDeviceCode = () => Promise.resolve({ ...code, expiresInSec: 60 });
        await runDeviceFlow(api, { clock, ...silent });

        expect(clock.sleeps).to.deep.equal([5000, 10_000, 10_000]);
    });

    it('stops polling once expires_in has passed', async () => {
        const clock = createFakeClock();
        const { api, polls } = fakeApi([{ status: 'pending' }]);

        expect(await rejection(runDeviceFlow(api, { clock, ...silent }))).to.be.instanceOf(DeviceFlowExpiredError);
        // 12 seconds at a 5 second interval: polls at 5, 10 and 15 seconds, then the deadline
        expect(polls()).to.equal(3);
    });

    it('reports a user refusal as DeviceFlowDeniedError', async () => {
        const { api } = fakeApi([{ status: 'denied' }]);

        const error = await rejection(runDeviceFlow(api, { clock: createFakeClock(), ...silent }));

        expect(error).to.be.instanceOf(DeviceFlowDeniedError);
    });

    it('survives isolated network failures and reports them', async () => {
        const clock = createFakeClock();
        const failure = new NetworkError('https://example.com/auth/token/', new TypeError('fetch failed'));
        const reported: number[] = [];
        const { api, polls } = fakeApi([failure, failure, { status: 'authorized', token: 'tok' }]);

        const token = await runDeviceFlow(api, {
            clock,
            ...silent,
            onTransientError: (_error, consecutive) => reported.push(consecutive),
        });

        expect(token).to.equal('tok');
        expect(polls()).to.equal(3);
        expect(reported).to.deep.equal([1, 2]);
    });

    it('gives up with the last error after maxConsecutiveErrors failures in a row', async () => {
        const clock = createFakeClock();
        const failure = new NetworkError('https://example.com/auth/token/', new TypeError('fetch failed'));
        const { api, polls } = fakeApi([failure]);

        api.requestDeviceCode = () => Promise.resolve({ ...code, expiresInSec: 3600 });

        const error = await rejection(runDeviceFlow(api, { clock, ...silent, maxConsecutiveErrors: 4 }));

        expect(error).to.be.instanceOf(NetworkError);
        expect(polls()).to.equal(4);
    });

    it('gives CancelledError before asking for a code at all when already aborted', async () => {
        const controller = new AbortController();
        const shown: string[] = [];

        controller.abort();

        let requested = 0;
        const { api, polls } = fakeApi([{ status: 'authorized', token: 'tok' }]);

        api.requestDeviceCode = () => {
            requested += 1;

            return Promise.resolve(code);
        };

        const error = await rejection(runDeviceFlow(api, {
            clock: createFakeClock(),
            onCode: c => shown.push(c.userCode),
            signal: controller.signal,
        }));

        expect(error).to.be.instanceOf(CancelledError);
        expect(requested).to.equal(0);
        expect(shown).to.deep.equal([]);
        expect(polls()).to.equal(0);
    });

    it('turns Ctrl+C in the middle of the wait into CancelledError and stops polling', async () => {
        const clock = createFakeClock();
        const controller = new AbortController();

        // the cancellation lands while the first poll is in flight
        const { api, polls } = fakeApi([{ status: 'pending' }], () => {
            controller.abort();
        });

        const error = await rejection(runDeviceFlow(api, { clock, signal: controller.signal, ...silent }));

        expect(error).to.be.instanceOf(CancelledError);
        expect(polls()).to.equal(1);
    });
});
