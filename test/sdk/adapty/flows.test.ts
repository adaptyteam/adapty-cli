import { expect } from 'chai';

import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

const BASE = 'https://api.example.com/v1';
const APP = 'app-1';
const TREE = { data: { views: 1 } };

describe('adapty.flows.metrics', () => {
    const setup = (script: Parameters<typeof createScriptedFetch>[0]) => {
        const scripted = createScriptedFetch(script);
        const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

        return { calls: scripted.calls, metrics: adapty.flows.metrics };
    };

    it('does not repeat a metrics POST, and leaves the server wait on the error', async () => {
        for (const status of [429, 503]) {
            const { calls, metrics } = setup([{ headers: { 'retry-after': '2' }, status }, { body: TREE }]);

            const error = await rejection(metrics.get(APP, 'flow-1', { dateFrom: '2026-09-01', dateTo: '2026-09-30' }));

            expect(error).to.have.property('status', status);
            expect(error).to.have.property('retryAfterMs', 2000);
            expect(calls, String(status)).to.have.length(1);
        }
    });

    it('repeats a read GET after a 503', async () => {
        const { calls, metrics } = setup([{ status: 503 }, { body: { data: [], meta: null } }]);

        await metrics.values(APP, 'flow-1');

        expect(calls.map(call => call.method)).to.deep.equal(['GET', 'GET']);
    });
});

describe('adapty.flows.funnel', () => {
    const INPUT = { dateFrom: '2026-10-01', dateTo: '2026-10-29', dateType: 'purchase_date' };

    const setup = (script: Parameters<typeof createScriptedFetch>[0]) => {
        const scripted = createScriptedFetch(script);
        const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

        return { calls: scripted.calls, funnel: adapty.flows.funnel };
    };

    it('does not repeat a funnel POST, as a JSON answer or as a CSV, and leaves the server wait on the error', async () => {
        for (const status of [429, 503]) {
            for (const read of ['get', 'csv'] as const) {
                const { calls, funnel } = setup([{ headers: { 'retry-after': '2' }, status }, { body: TREE }]);

                const error = await rejection(funnel[read](APP, 'flow-1', INPUT));

                expect(error, `${read} ${status}`).to.have.property('status', status);
                expect(error, `${read} ${status}`).to.have.property('retryAfterMs', 2000);
                expect(calls, `${read} ${status}`).to.have.length(1);
            }
        }
    });

    it('repeats a values GET after a 503', async () => {
        const { calls, funnel } = setup([{ status: 503 }, { body: { data: [], meta: null } }]);

        await funnel.values(APP, 'flow-1');

        expect(calls.map(call => call.method)).to.deep.equal(['GET', 'GET']);
    });
});
