import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';

import { createAdapty } from '../../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../../src/sdk/core/errors.js';
import { createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

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
        expect(calls[0]?.url).to.equal(`${BASE}/migrations`);
        expect(calls[0]?.headers.get('authorization')).to.equal('Bearer t');
        expect(result).to.deep.equal(list);
    });

    it('reads one migration by id', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        const result = await migrations.get('mig_01H9Z');

        expect(calls[0]?.method).to.equal('GET');
        expect(calls[0]?.url).to.equal(`${BASE}/migrations/mig_01H9Z`);
        expect(result).to.deep.equal(ENVELOPE);
    });

    it('reads a named resource of a migration', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        const result = await migrations.resource('mig_01H9Z', 'report');

        expect(calls[0]?.method).to.equal('GET');
        expect(calls[0]?.url).to.equal(`${BASE}/migrations/mig_01H9Z/resources/report`);
        expect(result).to.deep.equal(ENVELOPE);
    });

    it('creates a migration for an app that does not exist yet', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        const result = await migrations.create({ appName: 'Acme Fitness' });

        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/migrations`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ app_name: 'Acme Fitness', flow: 'main' });
        expect(result).to.deep.equal(ENVELOPE);
    });

    it('creates an optional flow for an app that exists', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        await migrations.create({ appId: 'app_1', flow: 'transactions' });

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ app_id: 'app_1', flow: 'transactions' });
    });

    it('carries an idempotency key, so a retried create cannot start a second migration', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }, { body: ENVELOPE }]);

        await migrations.create({ appName: 'A' });
        await migrations.create({ appName: 'A' });

        const [first, second] = calls.map(call => call.headers.get('idempotency-key'));

        expect(first).to.match(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
        expect(second).to.not.equal(first);
    });

    it('breaks the create rule before reaching the network', async () => {
        const { calls, migrations } = setup([]);

        const error = await rejection(migrations.create({}));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });

    // The wizard is another service behind the same host: Core proxies /migrations through to it,
    // and a trailing slash on a collection there is a 404 indistinguishable from a wrong path.
    it('sends no trailing slash, while the rest of the developer API keeps it', async () => {
        const scripted = createScriptedFetch([{ body: { available: [], items: [] } }, { body: { data: [] } }]);
        const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

        await adapty.migrations.list();
        await adapty.apps.list();

        expect(scripted.calls.map(call => call.url)).to.deep.equal([`${BASE}/migrations`, `${BASE}/apps/`]);
    });
});
