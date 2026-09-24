import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';

import { createAdapty } from '../../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

import type { Envelope, MigrationState } from '../../../../src/sdk/adapty/index.js';

const FIXTURE_PATH = fileURLToPath(new URL('../../../fixtures/migration-envelope.json', import.meta.url));
const ENVELOPE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown;

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, migrations: adapty.migrations };
};

const envelopeAt = (state: MigrationState, revision: number, pollAfterSeconds = 30): Envelope => {
    const envelope = ENVELOPE as Envelope;

    return {
        ...envelope,
        migration: { ...envelope.migration, poll_after_seconds: pollAfterSeconds, revision, state },
    };
};

/** Use a fake clock to test polling without real delays. */
const setupWait = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const clock = createFakeClock();
    const adapty = createAdapty({ baseUrl: BASE, clock, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, clock, migrations: adapty.migrations };
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

    it('runs an action against the revision the caller read', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        await migrations.runAction('mig_01H9Z', 'resolve_mapping', {
            expectedRevision: 12,
            input: { decisions: [] },
        });

        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/migrations/mig_01H9Z/actions/resolve_mapping`);

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({
            expected_revision: 12,
            input: { decisions: [] },
        });
    });

    it('sends an empty input for an action that asks for none', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        await migrations.runAction('mig_01H9Z', 'source_discover', { expectedRevision: 1 });

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ expected_revision: 1, input: {} });
    });

    it('refuses an input that is not an object before reaching the network', async () => {
        const { calls, migrations } = setup([]);

        const error = await rejection(migrations.runAction('mig_01H9Z', 'resolve_mapping', {
            expectedRevision: 1,
            input: [1, 2],
        }));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });

    it('closes a migration with the outcome and the revision it was decided on', async () => {
        const { calls, migrations } = setup([{ body: ENVELOPE }]);

        await migrations.close('mig_01H9Z', { expectedRevision: 7, outcome: 'finish' });

        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/migrations/mig_01H9Z/close`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ expected_revision: 7, outcome: 'finish' });
    });

    it('refuses an outcome it does not know before reaching the network', async () => {
        const { calls, migrations } = setup([]);

        const error = await rejection(migrations.close('mig_01H9Z', { expectedRevision: 7, outcome: 'archive' }));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });

    it('waits no longer than it has to: a migration that already wants the user answers at once', async () => {
        const { calls, clock, migrations } = setupWait([{ body: envelopeAt('action_required', 7) }]);

        const result = await migrations.waitFor('mig_01H9Z');

        expect(calls).to.have.lengthOf(1);
        expect(clock.sleeps).to.deep.equal([]);
        expect(result.migration.revision).to.equal(7);
    });

    it('polls at the pace the server asks until the revision moves', async () => {
        const { calls, clock, migrations } = setupWait([
            { body: envelopeAt('running', 7) },
            { body: envelopeAt('running', 7) },
            { body: envelopeAt('running', 8) },
        ]);

        const seen: number[] = [];
        const result = await migrations.waitFor('mig_01H9Z', { onPoll: (_, delayMs) => seen.push(delayMs) });

        expect(calls).to.have.lengthOf(3);
        expect(clock.sleeps).to.deep.equal([30_000, 30_000]);
        expect(seen).to.deep.equal([30_000, 30_000]);
        expect(result.migration.revision).to.equal(8);
    });

    it('never asks faster than every five seconds, whatever the server says', async () => {
        const { clock, migrations } = setupWait([
            { body: envelopeAt('running', 7, 0) },
            { body: envelopeAt('running', 8, 0) },
        ]);

        await migrations.waitFor('mig_01H9Z');

        expect(clock.sleeps).to.deep.equal([5000]);
    });

    it('stops as soon as the flow is over, even though the revision did not move', async () => {
        const { calls, migrations } = setupWait([
            { body: envelopeAt('running', 7) },
            { body: envelopeAt('completed', 7) },
        ]);

        const result = await migrations.waitFor('mig_01H9Z');

        expect(calls).to.have.lengthOf(2);
        expect(result.migration.state).to.equal('completed');
    });

    it('gives up at the timeout and answers with what it last read, which is not an error', async () => {
        const { calls, clock, migrations } = setupWait([
            { body: envelopeAt('running', 7, 5) },
            { body: envelopeAt('running', 7, 5) },
            { body: envelopeAt('running', 7, 5) },
        ]);

        const result = await migrations.waitFor('mig_01H9Z', { timeoutMs: 12_000 });

        expect(calls).to.have.lengthOf(3);
        expect(clock.sleeps).to.deep.equal([5000, 5000]);
        expect(result.migration.state).to.equal('running');
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

    // Migration endpoints return 404 for trailing slashes.
    it('sends no trailing slash, while the rest of the developer API keeps it', async () => {
        const scripted = createScriptedFetch([{ body: { available: [], items: [] } }, { body: { data: [] } }]);
        const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

        await adapty.migrations.list();
        await adapty.apps.list();

        expect(scripted.calls.map(call => call.url)).to.deep.equal([`${BASE}/migrations`, `${BASE}/apps/`]);
    });
});
