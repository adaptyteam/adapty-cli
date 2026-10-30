import { expect } from 'chai';

import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../src/sdk/core/errors.js';
import { createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, groups: adapty.productGroups };
};

const page = (names: string[], pages = 1) => ({
    data: names.map((name, index) => ({ group_id: `g${index}`, group_name: name })),
    meta: { pagination: { count: names.length, page: 1, pages } },
});

const CREATED = { body: { group_name: 'Pro' }, status: 201 };

describe('adapty.productGroups', () => {
    it('lists the groups of a store', async () => {
        const { calls, groups } = setup([{ body: page(['Premium']) }]);

        const result = await groups.list('a1', 'app_store');

        expect(calls[0]?.url).to.equal(`${BASE}/apps/a1/product-groups/?store=app_store`);
        expect(result.data).to.deep.equal([{ group_id: 'g0', group_name: 'Premium' }]);
    });

    it('lists the page asked for', async () => {
        const { calls, groups } = setup([{ body: page(['Premium']) }]);

        await groups.list('a1', 'play_store', { page: 2, pageSize: 50 });

        expect(calls[0]?.url).to.equal(`${BASE}/apps/a1/product-groups/?page%5Bnumber%5D=2&page%5Bsize%5D=50&store=play_store`);
    });

    it('creates the group, then reads the list to give its id', async () => {
        const { calls, groups } = setup([CREATED, { body: page(['Premium', 'Pro']) }]);

        const created = await groups.create('a1', { name: 'Pro', store: 'app_store' });

        expect(calls.map(call => call.method)).to.deep.equal(['POST', 'GET']);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ group_name: 'Pro', store: 'app_store' });
        expect(created).to.deep.equal({ group_id: 'g1', group_name: 'Pro' });
    });

    it('sends the trimmed name and finds the group by it', async () => {
        const { calls, groups } = setup([CREATED, { body: page(['Pro']) }]);

        const created = await groups.create('a1', { name: ' Pro ', store: 'app_store' });

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ group_name: 'Pro', store: 'app_store' });
        expect(created).to.deep.equal({ group_id: 'g0', group_name: 'Pro' });
    });

    it('looks for the new group on every page of the list', async () => {
        const second = { data: [{ group_id: 'g9', group_name: 'Pro' }], meta: { pagination: { count: 2, page: 2, pages: 2 } } };
        const { calls, groups } = setup([CREATED, { body: page(['Premium'], 2) }, { body: second }]);

        const created = await groups.create('a1', { name: 'Pro', store: 'app_store' });

        expect(calls[2]?.url).to.equal(`${BASE}/apps/a1/product-groups/?page%5Bnumber%5D=2&page%5Bsize%5D=100&store=app_store`);
        expect(created.group_id).to.equal('g9');
    });

    it('answers a null id when the list does not show the group', async () => {
        const { groups } = setup([CREATED, { body: page([]) }]);

        expect(await groups.create('a1', { name: 'Pro', store: 'app_store' })).to.deep.equal({ group_id: null, group_name: 'Pro' });
    });

    for (const name of ['', ' ', 'x'.repeat(65)]) {
        it(`refuses the name "${name.slice(0, 8)}" (${name.length} characters) before any request`, async () => {
            const { calls, groups } = setup([]);

            expect(await rejection(groups.create('a1', { name, store: 'app_store' }))).to.be.instanceOf(ValidationError);
            expect(calls).to.have.lengthOf(0);
        });
    }
});
