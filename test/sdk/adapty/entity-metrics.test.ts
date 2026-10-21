import { expect } from 'chai';

import { createAdapty, validateMetricsInput } from '../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

import type { MetricsInput } from '../../../src/sdk/adapty/index.js';

const BASE = 'https://api.example.com/v1';
const APP = 'app-1';
const TREE = { data: { views: 1 } };

describe('validateMetricsInput', () => {
    const cases: { expected: (string | undefined)[]; input: MetricsInput; name: string }[] = [
        { expected: [], input: {}, name: 'no period' },
        { expected: [], input: { dateFrom: '2026-09-01', dateTo: '2026-09-30' }, name: 'both ends' },
        { expected: ['dateTo'], input: { dateFrom: '2026-09-01' }, name: 'a start without an end' },
        { expected: ['dateFrom'], input: { dateTo: '2026-09-30' }, name: 'an end without a start' },
        {
            expected: [],
            input: { basedOn: 'paywall', dateType: 'shown_at', granularity: 'decade', groupBy: 'product' },
            name: 'values that the server judges',
        },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(validateMetricsInput(input).map(issue => issue.path)).to.deep.equal(expected);
        });
    }
});

describe('adapty.entityMetrics', () => {
    const setup = (script: Parameters<typeof createScriptedFetch>[0]) => {
        const scripted = createScriptedFetch(script);
        const clock = createFakeClock();
        const adapty = createAdapty({ baseUrl: BASE, clock, fetch: scripted.fetch, token: 't' });

        return { calls: scripted.calls, clock, metrics: adapty.entityMetrics };
    };

    it('waits out a 429 on a metrics POST and sends it again, because it only reads', async () => {
        const { calls, clock, metrics } = setup([{ headers: { 'retry-after': '1' }, status: 429 }, { body: TREE }]);

        const answer = await metrics.flows.get(APP, 'flow-1', { dateFrom: '2026-09-01', dateTo: '2026-09-30' });

        expect(answer).to.deep.equal(TREE);
        expect(calls.map(call => call.method)).to.deep.equal(['POST', 'POST']);
        expect(calls[1]?.body).to.equal(calls[0]?.body);
        expect(clock.sleeps).to.deep.equal([1000]);
    });

    it('refuses half a period without a request', async () => {
        const { calls, metrics } = setup([{ body: TREE }]);

        const error = await rejection(metrics.placements.get(APP, 'placement-1', 'flow', { dateFrom: '2026-09-01' }));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });
});
