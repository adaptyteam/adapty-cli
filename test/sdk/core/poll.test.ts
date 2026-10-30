import { expect } from 'chai';

import { CancelledError } from '../../../src/sdk/core/errors.js';
import { DEFAULT_TIMEOUT_MS, pollUntil } from '../../../src/sdk/core/poll.js';
import { createFakeClock } from '../../../src/sdk/core/testing.js';

/** Answers the scripted values in order, then repeats the last one. */
const reader = (values: readonly number[]) => {
    let calls = 0;

    return {
        get calls() {
            return calls;
        },
        read: () => {
            const value = values[Math.min(calls, values.length - 1)] ?? 0;
            calls += 1;

            return Promise.resolve(value);
        },
    };
};

describe('pollUntil', () => {
    it('reads once and does not pause when the first read is already done', async () => {
        const clock = createFakeClock();
        const source = reader([3]);

        const result = await pollUntil({ clock, done: value => value >= 3, intervalMs: 1000, read: source.read });

        expect(result).to.equal(3);
        expect(source.calls).to.equal(1);
        expect(clock.sleeps).to.deep.equal([]);
    });

    it('calls onPoll with the latest read and the delay before each pause', async () => {
        const clock = createFakeClock();
        const source = reader([1, 2, 3]);
        const seen: [number, number][] = [];

        const result = await pollUntil(
            { clock, done: value => value >= 3, intervalMs: 1000, read: source.read },
            { onPoll: (value, delayMs) => seen.push([value, delayMs]) },
        );

        expect(result).to.equal(3);
        expect(seen).to.deep.equal([[1, 1000], [2, 1000]]);
        expect(clock.sleeps).to.deep.equal([1000, 1000]);
    });

    it('takes the interval from the latest read when given a function', async () => {
        const clock = createFakeClock();
        const source = reader([1, 2, 3]);

        await pollUntil({ clock, done: value => value >= 3, intervalMs: value => value * 100, read: source.read });

        expect(clock.sleeps).to.deep.equal([100, 200]);
    });

    it('passes the first read to done, for waits that end on a change', async () => {
        const clock = createFakeClock();
        const source = reader([7, 7, 8]);

        const result = await pollUntil({
            clock,
            done: (value, first) => value !== first,
            intervalMs: 1000,
            read: source.read,
        });

        expect(result).to.equal(8);
        expect(source.calls).to.equal(3);
    });

    it('returns the last read instead of a pause that would pass the deadline', async () => {
        const clock = createFakeClock();
        const source = reader([0]);

        const result = await pollUntil(
            { clock, done: () => false, intervalMs: 5000, read: source.read },
            { timeoutMs: 12_000 },
        );

        expect(result).to.equal(0);
        expect(clock.sleeps).to.deep.equal([5000, 5000]);
        expect(source.calls).to.equal(3);
    });

    it('falls back to the default budget', async () => {
        const clock = createFakeClock();
        const source = reader([0]);

        await pollUntil({ clock, done: () => false, intervalMs: 10_000, read: source.read });

        expect(clock.sleeps).to.have.lengthOf(DEFAULT_TIMEOUT_MS / 10_000);
    });

    it('hands the signal to the clock, so an abort cancels the pause', async () => {
        const clock = createFakeClock();
        const controller = new AbortController();
        controller.abort();

        const error = await pollUntil(
            { clock, done: () => false, intervalMs: 1000, read: reader([0]).read },
            { signal: controller.signal },
        ).catch((error_: unknown) => error_);

        expect(error).to.be.instanceOf(CancelledError);
    });
});
