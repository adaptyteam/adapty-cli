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

const page = (names: string[]) => ({
    data: names.map((name, index) => ({ group_id: `g${index}`, group_name: name })),
    meta: { pagination: { count: names.length, page: 1, pages: 1 } },
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

    it('creates the group with the trimmed name and answers what the server answers', async () => {
        const { calls, groups } = setup([CREATED]);

        const created = await groups.create('a1', { name: ' Pro ', store: 'app_store' });

        expect(calls).to.have.lengthOf(1);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ group_name: 'Pro', store: 'app_store' });
        expect(created).to.deep.equal({ group_name: 'Pro' });
    });

    for (const name of ['', ' ', 'x'.repeat(65)]) {
        it(`refuses the name "${name.slice(0, 8)}" (${name.length} characters) before any request`, async () => {
            const { calls, groups } = setup([]);

            expect(await rejection(groups.create('a1', { name, store: 'app_store' }))).to.be.instanceOf(ValidationError);
            expect(calls).to.have.lengthOf(0);
        });
    }
});
