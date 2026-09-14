import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';

import { createAdapty } from '../../../../src/sdk/adapty/index.js';
import { createScriptedFetch } from '../../../../src/sdk/core/testing.js';

const FIXTURE_PATH = fileURLToPath(new URL('../../../fixtures/migration-envelope.json', import.meta.url));
const ENVELOPE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown;

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, migrations: adapty.migrations };
};

describe('adapty.migrations', () => {
    it('lists migrations and passes the body through untouched', async () => {
        const list = { available: [], items: [] };
        const { calls, migrations } = setup([{ body: list }]);

        const result = await migrations.list();

        expect(calls[0]?.method).to.equal('GET');
        expect(calls[0]?.url).to.equal(`${BASE}/migrations/`);
        expect(calls[0]?.headers.get('authorization')).to.equal('Bearer t');
        expect(result).to.deep.equal(list);
    });

    it('reads one migration by id', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        const result = await migrations.get('mig_01H9Z');

        expect(calls[0]?.method).to.equal('GET');
        expect(calls[0]?.url).to.equal(`${BASE}/migrations/mig_01H9Z/`);
        expect(result).to.deep.equal(ENVELOPE);
    });

    it('reads a named resource of a migration', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        const result = await migrations.resource('mig_01H9Z', 'report');

        expect(calls[0]?.method).to.equal('GET');
        expect(calls[0]?.url).to.equal(`${BASE}/migrations/mig_01H9Z/resources/report/`);
        expect(result).to.deep.equal(ENVELOPE);
    });
});
