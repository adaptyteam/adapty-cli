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
        const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

        return { calls: scripted.calls, metrics: adapty.entityMetrics };
    };

    it('does not repeat a metrics POST, and leaves the server wait on the error', async () => {
        for (const status of [429, 503]) {
            const { calls, metrics } = setup([{ headers: { 'retry-after': '2' }, status }, { body: TREE }]);

            const error = await rejection(metrics.flows.get(APP, 'flow-1', { dateFrom: '2026-09-01', dateTo: '2026-09-30' }));

            expect(error).to.have.property('status', status);
            expect(error).to.have.property('retryAfterMs', 2000);
            expect(calls, String(status)).to.have.length(1);
        }
    });

    it('repeats a read GET after a 503', async () => {
        const { calls, metrics } = setup([{ status: 503 }, { body: { data: [], meta: null } }]);

        await metrics.flows.values(APP, 'flow-1');

        expect(calls.map(call => call.method)).to.deep.equal(['GET', 'GET']);
    });

    it('refuses half a period without a request', async () => {
        const { calls, metrics } = setup([{ body: TREE }]);

        const error = await rejection(metrics.placements.get(APP, 'placement-1', 'flow', { dateFrom: '2026-09-01' }));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });
});
