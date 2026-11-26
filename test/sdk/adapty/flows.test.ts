import { expect } from 'chai';

import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { ApiError } from '../../../src/sdk/core/errors.js';
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

/**
 * external: `flows publish` saves the config it read and publishes after the save, so a success answer that is
 * not the config envelope is an error. These rows cover validation of the envelope, config and lock.
 */
describe('adapty.flows.config', () => {
    const CONFIG = { config: { screens: [] }, remote_configs: [{ data: '{}', locale: 'en' }], status: 'draft', updated_at: 1_794_000_000_000 };
    const INPUT = { config: CONFIG.config, expectedUpdatedAt: CONFIG.updated_at, remoteConfigs: CONFIG.remote_configs };

    const setup = (answer: Parameters<typeof createScriptedFetch>[0][number]) => {
        const scripted = createScriptedFetch([answer]);

        return createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' }).flows.config;
    };

    const rows: { answer: Parameters<typeof setup>[0]; call: 'get' | 'update'; id: string; message: string }[] = [
        { answer: { body: [CONFIG] }, call: 'get', id: 'an envelope that is an array', message: 'not a JSON object' },
        { answer: { body: { ...CONFIG, config: [] } }, call: 'update', id: 'a config that is an array', message: 'no config' },
        { answer: { body: { ...CONFIG, updated_at: '1794000000000' } }, call: 'get', id: 'a string timestamp', message: 'no updated_at' },
    ];

    for (const row of rows) {
        it(`${row.call}: ${row.id} is malformed_response`, async () => {
            const config = setup(row.answer);
            const error = await rejection(row.call === 'get' ? config.get(APP, 'flow-1') : config.update(APP, 'flow-1', INPUT));

            expect(error, row.id).to.be.instanceOf(ApiError);
            expect(error, row.id).to.include({ code: 'malformed_response', status: 200 });
            expect((error as Error).message, row.id).to.include(row.message);
        });
    }

    for (const call of ['get', 'update'] as const) {
        it(`${call}: the config envelope is the answer`, async () => {
            const config = setup({ body: CONFIG });
            const answer = await (call === 'get' ? config.get(APP, 'flow-1') : config.update(APP, 'flow-1', INPUT));

            expect(answer).to.deep.equal(CONFIG);
        });
    }
});
