import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { createMigrationContext } from '../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../src/cli/context/migration/store.js';
import { assertFetch, mockFetch, mockFetchFailure } from '../helpers/mock-fetch.js';

import type { MigrationContextStore } from '../../src/cli/context/migration/store.js';
import type { Envelope } from '../../src/sdk/adapty/index.js';

const TOKEN = 'selection-test-token';
const PREVIOUS = createMigrationContext({ token: TOKEN }, 'mig_previous');

const ENVELOPE = JSON.parse(await fs.readFile(
    new URL('../fixtures/migration-envelope.json', import.meta.url), 'utf8',
)) as Envelope;

describe('migrations use', () => {
    let store: MigrationContextStore;

    beforeEach(async () => {
        process.env.ADAPTY_TOKEN = TOKEN;
        const config = await Config.load(fileURLToPath(new URL('../../', import.meta.url)));
        store = createMigrationContextStore(config.configDir);
        await store.save(PREVIOUS);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('verifies access with the effective token and saves the returned ID before printing it', async () => {
        const fetch = mockFetch([ENVELOPE]);
        const { stdout, error } = await runCommand('migrations use mig_requested --json');

        expect(error).to.equal(undefined);

        assertFetch({
            callIndex: 0, method: 'GET', path: '/migrations/mig_requested', stub: fetch,
        });

        const init = fetch.firstCall.args[1] as RequestInit;

        expect(new Headers(init.headers).get('authorization')).to.equal(`Bearer ${TOKEN}`);

        expect(fetch.callCount).to.equal(1);
        expect(JSON.parse(stdout)).to.deep.equal({ currentMigrationId: ENVELOPE.migration.id });
        expect(await store.load()).to.deep.equal(createMigrationContext({ token: TOKEN }, ENVELOPE.migration.id));
    });

    for (const state of ['completed', 'canceled', 'failed']) {
        it(`allows selecting a ${state} migration`, async () => {
            mockFetch([{ ...ENVELOPE, migration: { ...ENVELOPE.migration, state } }]);
            const { stdout, error } = await runCommand('migrations use mig_requested');

            expect(error).to.equal(undefined);
            expect(stdout).to.contain(ENVELOPE.migration.id);
            expect((await store.load())?.currentMigrationId).to.equal(ENVELOPE.migration.id);
        });
    }

    for (const status of [401, 403, 404]) {
        it(`preserves the previous selection on HTTP ${status}`, async () => {
            const fetch = mockFetchFailure({ error: { message: 'Access denied' } }, { status });
            const { error, stdout } = await runCommand('migrations use mig_requested');

            expect(error?.oclif?.exit).to.equal(status === 404 ? 4 : 3);
            expect(stdout).to.equal('');
            expect(fetch.callCount).to.equal(1);
            expect(await store.load()).to.deep.equal(PREVIOUS);
        });
    }

    it('reports a failed save without printing success or losing the previous selection', async () => {
        mockFetch([ENVELOPE]);
        sinon.stub(fs, 'rename').rejects(new Error(`private error ${TOKEN}`));
        const { error, stdout } = await runCommand('migrations use mig_requested');

        expect(error?.oclif?.exit).to.equal(1);
        expect(error?.code).to.equal('migration_context_io');
        expect(error?.message).not.to.contain(TOKEN);
        expect(stdout).to.equal('');
        expect(await store.load()).to.deep.equal(PREVIOUS);
    });

    it('replaces malformed context after a successful GET', async () => {
        await fs.writeFile(store.path, '{broken');
        mockFetch([ENVELOPE]);
        const { error } = await runCommand('migrations use mig_requested');

        expect(error).to.equal(undefined);
        expect((await store.load())?.currentMigrationId).to.equal(ENVELOPE.migration.id);
    });

    for (const json of [false, true]) {
        it(`saves the argument despite an env override and warns on stderr (json=${json})`, async () => {
            process.env.ADAPTY_MIGRATION = 'mig_env';
            const fetch = mockFetch([ENVELOPE]);

            const { stdout, stderr, error } = await runCommand([
                'migrations', 'use', 'mig_requested', ...(json ? ['--json'] : []),
            ]);

            expect(error).to.equal(undefined);
            assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_requested', stub: fetch });
            expect(stderr).to.contain('ADAPTY_MIGRATION');
            expect(stderr).to.contain('Unset it');
            expect(stdout).not.to.contain('Warning');
            expect((await store.load())?.currentMigrationId).to.equal(ENVELOPE.migration.id);
            expect(process.env.ADAPTY_MIGRATION).to.equal('mig_env');
        });
    }

    for (const args of [[], [''], ['   ']]) {
        it(`rejects invalid input ${JSON.stringify(args)} before requiring auth`, async () => {
            delete process.env.ADAPTY_TOKEN;
            const fetch = mockFetch();
            const { error } = await runCommand(['migrations', 'use', ...args]);

            expect(error?.oclif?.exit).to.equal(2);
            expect(fetch.callCount).to.equal(0);
            expect(await store.load()).to.deep.equal(PREVIOUS);
        });
    }

    it('requires authentication for a valid argument', async () => {
        delete process.env.ADAPTY_TOKEN;
        const fetch = mockFetch();
        const { error } = await runCommand('migrations use mig_requested');

        expect(error?.oclif?.exit).to.equal(3);
        expect(fetch.callCount).to.equal(0);
        expect(await store.load()).to.deep.equal(PREVIOUS);
    });
});
