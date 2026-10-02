import fs from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { createMigrationContext } from '../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../src/cli/context/migration/store.js';
import { assertFetch, mockFetch, mockFetchFailure } from '../helpers/mock-fetch.js';

import type { MigrationContextStore } from '../../src/cli/context/migration/store.js';
import type { Envelope } from '../../src/sdk/adapty/index.js';

const TOKEN = 'operations-token';
const SAVED = createMigrationContext({ token: TOKEN }, 'mig_saved');

const ENVELOPE = JSON.parse(await fs.readFile(
    new URL('../fixtures/migration-envelope.json', import.meta.url), 'utf8',
)) as Envelope;

const commands = [
    { args: ['status'], suffix: '', write: undefined },
    { args: ['steps'], suffix: '', write: undefined },
    { args: ['show'], suffix: '', write: undefined },
    { args: ['show', 'report'], suffix: '/resources/report', write: undefined },
    { args: ['run', 'act_confirm_paywalls', '--yes'], suffix: '', write: '/actions/act_confirm_paywalls' },
    { args: ['close', '--outcome', 'finish', '--yes'], suffix: '', write: '/close' },
];

describe('migration operations with saved context', () => {
    let store: MigrationContextStore;

    beforeEach(async () => {
        process.env.ADAPTY_TOKEN = TOKEN;
        const config = await Config.load(join(import.meta.dirname, '..', '..'));
        store = createMigrationContextStore(config.configDir);
        await store.save(SAVED);
    });

    afterEach(() => {
        sinon.restore();
    });

    for (const { args, suffix, write } of commands) {
        for (const source of ['context', 'env', 'flag']) {
            it(`${args.join(' ')} uses ${source} with the expected priority`, async () => {
                if (source !== 'context') {
                    process.env.ADAPTY_MIGRATION = 'mig_env';
                    await fs.writeFile(store.path, '{broken');
                }

                const before = await fs.readFile(store.path, 'utf8');
                const fetch = mockFetch([ENVELOPE]);
                const id = { flag: 'mig_flag', env: 'mig_env', context: 'mig_saved' }[source] ?? 'mig_saved';

                const { stdout, stderr, error } = await runCommand([
                    'migrations', ...args, ...(source === 'flag' ? ['-m', id] : []), '--json',
                ]);

                expect(error).to.equal(undefined);
                expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
                assertFetch({ callIndex: 0, method: 'GET', path: `/migrations/${id}${suffix}`, stub: fetch });
                expect(fetch.callCount).to.equal(write === undefined ? 1 : 2);

                if (write !== undefined) {
                    assertFetch({
                        callIndex: 1, method: 'POST', path: `/migrations/${id}${write}`, stub: fetch,
                        body: { expected_revision: ENVELOPE.migration.revision },
                    });

                    expect(stderr.includes(`Using saved migration: ${id}`)).to.equal(source === 'context');
                }

                expect(await fs.readFile(store.path, 'utf8')).to.equal(before);
            });
        }
    }

    for (const { args, write } of commands.filter(command => command.write !== undefined)) {
        it(`${args[0]} keeps its target when another terminal replaces context after GET`, async () => {
            const fetch = mockFetch([ENVELOPE]);

            fetch.onFirstCall().callsFake(async () => {
                await store.save(createMigrationContext({ token: TOKEN }, 'mig_other'));

                return new Response(JSON.stringify(ENVELOPE));
            });

            const { error, stderr } = await runCommand(['migrations', ...args]);

            expect(error).to.equal(undefined);
            expect(stderr).to.contain('Using saved migration: mig_saved');
            assertFetch({ callIndex: 1, method: 'POST', path: `/migrations/mig_saved${write}`, stub: fetch });
            expect((await store.load())?.currentMigrationId).to.equal('mig_other');
        });
    }

    it('keeps the captured ID through status polling when context changes', async () => {
        const fetch = mockFetch([ENVELOPE]);

        fetch.onFirstCall().callsFake(async () => {
            await store.save(createMigrationContext({ token: TOKEN }, 'mig_other'));

            return new Response(JSON.stringify({ ...ENVELOPE, migration: { ...ENVELOPE.migration, state: 'running' } }));
        });

        const { stdout, error } = await runCommand('migrations status --wait --timeout 10s --json');

        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
        expect(fetch.callCount).to.equal(2);

        for (const callIndex of [0, 1]) {
            assertFetch({ callIndex, method: 'GET', path: '/migrations/mig_saved', stub: fetch });
        }
    });

    for (const args of [['status', '-m', '""'], ['status', '-m', '"   "']]) {
        it(`rejects a blank explicit ID ${JSON.stringify(args)} instead of falling back`, async () => {
            const fetch = mockFetch();
            const { error } = await runCommand(['migrations', ...args]);

            expect(error?.oclif?.exit).to.equal(2);
            expect(error?.code).to.equal('migration_required');
            expect(fetch.callCount).to.equal(0);
        });
    }

    it('uses saved context for an empty environment ID', async () => {
        process.env.ADAPTY_MIGRATION = '';
        const fetch = mockFetch([ENVELOPE]);
        const { error } = await runCommand('migrations status');

        expect(error).to.equal(undefined);
        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_saved', stub: fetch });
    });

    it('rejects a whitespace environment ID', async () => {
        process.env.ADAPTY_MIGRATION = '   ';
        const fetch = mockFetch();
        const { error } = await runCommand('migrations status');

        expect(error?.code).to.equal('migration_required');
        expect(fetch.callCount).to.equal(0);
    });

    for (const token of ['', 'another-token']) {
        it(`rejects inapplicable context for token ${JSON.stringify(token)} without requests`, async () => {
            process.env.ADAPTY_TOKEN = token;
            const fetch = mockFetch();
            const { error } = await runCommand('migrations status');

            expect(error?.oclif?.exit).to.equal(2);
            expect(error?.code).to.equal('migration_required');
            expect(fetch.callCount).to.equal(0);
            expect(await store.load()).to.deep.equal(SAVED);
        });
    }

    it('requires auth when an explicit ID is supplied without a token', async () => {
        delete process.env.ADAPTY_TOKEN;
        const fetch = mockFetch();
        const { error } = await runCommand('migrations status -m mig_explicit');

        expect(error?.oclif?.exit).to.equal(3);
        expect(fetch.callCount).to.equal(0);
    });

    it('validates action input before reading corrupted context', async () => {
        await fs.writeFile(store.path, '{broken');
        const fetch = mockFetch();
        const { error } = await runCommand(['migrations', 'run', 'act_confirm_paywalls', '--input', '[]']);

        expect(error?.oclif?.exit).to.equal(2);
        expect(error?.message).to.contain('input');
        expect(fetch.callCount).to.equal(0);
    });

    it('still requires action confirmation for a saved migration', async () => {
        const fetch = mockFetch([ENVELOPE]);
        const { error } = await runCommand('migrations run act_confirm_paywalls');

        expect(error?.oclif?.exit).to.equal(6);
        expect(fetch.callCount).to.equal(1);
    });

    it('preserves the saved selection when the server returns 404', async () => {
        mockFetchFailure({ error: { message: 'Not found' } }, { status: 404 });
        const { error } = await runCommand('migrations status');

        expect(error?.oclif?.exit).to.equal(4);
        expect(await store.load()).to.deep.equal(SAVED);
    });
});
