import { expect } from 'chai';

import { createAdapty } from '../../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../../src/sdk/core/errors.js';
import { createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, apps: adapty.apps };
};

const emptyPage = { data: [], meta: { pagination: { count: 0, page: 2, pages: 1 } } };

describe('adapty.apps', () => {
    it('asks for a page with the names this API uses, and leaves an unset parameter out', async () => {
        const { apps, calls } = setup([{ body: emptyPage }]);

        const page = await apps.list({ page: 2 });

        expect(calls[0]?.url).to.equal(`${BASE}/apps/?page%5Bnumber%5D=2`);
        // Passed through as the server sent it: this object is what --json prints
        expect(page).to.deep.equal(emptyPage);
    });

    it('turns a camelCase input into a snake_case body and sends no undefined fields', async () => {
        const { apps, calls } = setup([{ body: { id: 'a1', sdk_key: 'k', title: 'A' } }]);

        await apps.create({ appleBundleId: 'com.a', platforms: ['ios'], title: 'A' });

        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/`);

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({
            apple_bundle_id: 'com.a',
            platforms: ['ios'],
            title: 'A',
        });
    });

    it('breaks a create rule before reaching the network', async () => {
        const { apps, calls } = setup([]);

        const error = await rejection(apps.create({ platforms: ['ios'], title: 'A' }));

        expect(error).to.be.instanceOf(ValidationError);
        expect((error as ValidationError).issues.map(issue => issue.path)).to.deep.equal(['appleBundleId']);
        expect(calls).to.have.length(0);
    });

    it('sends an update as a PUT carrying only the fields that were given', async () => {
        const { apps, calls } = setup([{ body: { id: 'a1', title: 'B' } }]);

        await apps.update('a1', { title: 'B' });

        expect(calls[0]?.method).to.equal('PUT');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/a1/`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ title: 'B' });
    });

    it('refuses an update with nothing in it, also before the network', async () => {
        const { apps, calls } = setup([]);

        const error = await rejection(apps.update('a1', {}));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });
});
