import { expect } from 'chai';

import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

const BASE = 'https://api.example.com/v1';
const APP = 'app-1';
const TREE = { data: { views: 1 } };

describe('adapty.placements.metrics', () => {
    const setup = (script: Parameters<typeof createScriptedFetch>[0]) => {
        const scripted = createScriptedFetch(script);
        const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

        return { calls: scripted.calls, metrics: adapty.placements.metrics };
    };

    it('refuses half a period without a request', async () => {
        const { calls, metrics } = setup([{ body: TREE }]);

        const error = await rejection(metrics.get(APP, 'placement-1', 'flow', { dateFrom: '2026-09-01' }));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });
});
