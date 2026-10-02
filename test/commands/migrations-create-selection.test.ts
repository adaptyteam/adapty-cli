import fs from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { createMigrationContext } from '../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../src/cli/context/migration/store.js';
import { mockFetch, mockFetchFailure } from '../helpers/mock-fetch.js';

import type { MigrationContextStore } from '../../src/cli/context/migration/store.js';
import type { Envelope } from '../../src/sdk/adapty/index.js';

const TOKEN = 'creation-token';
const PREVIOUS = createMigrationContext({ token: TOKEN }, 'mig_previous');

const ENVELOPE = JSON.parse(await fs.readFile(
    new URL('../fixtures/migration-envelope.json', import.meta.url), 'utf8',
)) as Envelope;

describe('migration creation selection', () => {
    let store: MigrationContextStore;

    beforeEach(async () => {
        process.env.ADAPTY_TOKEN = TOKEN;
        const config = await Config.load(join(import.meta.dirname, '..', '..'));
        store = createMigrationContextStore(config.configDir);
        await store.save(PREVIOUS);
    });

    afterEach(() => {
        sinon.restore();
    });

    for (const json of [false, true]) {
        it(`saves the created ID (json=${json})`, async () => {
            const fetch = mockFetch([ENVELOPE]);

            const { stdout, error } = await runCommand([
                'migrations', 'create', '--name', 'App', ...(json ? ['--json'] : []),
            ]);

            expect(error).to.equal(undefined);
            expect(fetch.callCount).to.equal(1);
            expect(await store.load()).to.deep.equal(createMigrationContext({ token: TOKEN }, ENVELOPE.migration.id));

            if (json) {
                expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
            } else {
                expect(stdout).to.contain('Continue with `adapty migrations status`.');
            }
        });

        it(`warns on save failure while returning success and never retrying creation (json=${json})`, async () => {
            const fetch = mockFetch([ENVELOPE]);
            sinon.stub(fs, 'rename').rejects(new Error(`private ${TOKEN}`));

            const { stdout, stderr, error } = await runCommand([
                'migrations', 'create', '--name', 'App', ...(json ? ['--json'] : []),
            ]);

            expect(error).to.equal(undefined);
            expect(fetch.callCount).to.equal(1);
            expect(await store.load()).to.deep.equal(PREVIOUS);
            expect(stderr).to.contain(`Migration ${ENVELOPE.migration.id} was created`);
            expect(stderr).to.contain(`adapty migrations status -m ${ENVELOPE.migration.id}`);
            expect(stderr).not.to.contain(TOKEN);

            if (json) {
                expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
            } else {
                expect(stdout).to.contain('Migration created.');
            }
        });
    }

    it('leaves the previous selection untouched with --no-select', async () => {
        mockFetch([ENVELOPE]);
        const { stdout, error } = await runCommand('migrations create --name App --no-select --json');

        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
        expect(await store.load()).to.deep.equal(PREVIOUS);
    });

    it('does not access even malformed context with --no-select', async () => {
        await fs.writeFile(store.path, '{broken');
        mockFetch([ENVELOPE]);
        const { stdout, stderr, error } = await runCommand('migrations create --name App --no-select');

        expect(error).to.equal(undefined);
        expect(stderr).to.equal('');
        expect(stdout).to.contain(`adapty migrations status -m ${ENVELOPE.migration.id}`);
        expect(await fs.readFile(store.path, 'utf8')).to.equal('{broken');
    });

    it('saves the created ID and warns about the surviving environment override', async () => {
        process.env.ADAPTY_MIGRATION = 'mig_env';
        mockFetch([ENVELOPE]);
        const { stdout, stderr } = await runCommand('migrations create --name App --json');

        expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
        expect(stderr).to.contain('ADAPTY_MIGRATION still overrides');
        expect((await store.load())?.currentMigrationId).to.equal(ENVELOPE.migration.id);
    });

    it('preserves the previous selection on an API failure', async () => {
        mockFetchFailure({ error: { message: 'Invalid app' } }, { status: 422 });
        const { error } = await runCommand('migrations create --name App');

        expect(error?.oclif?.exit).to.equal(4);
        expect(await store.load()).to.deep.equal(PREVIOUS);
    });
});
