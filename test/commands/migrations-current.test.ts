import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { createMigrationContext } from '../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../src/cli/context/migration/store.js';
import { createFileSessionStore } from '../../src/sdk/core/session.js';

import type { MigrationContextStore } from '../../src/cli/context/migration/store.js';

const TOKEN = 'selection-test-token';

describe('migrations current', () => {
    let store: MigrationContextStore;
    let fetch: sinon.SinonStub;

    beforeEach(async () => {
        process.env.ADAPTY_TOKEN = TOKEN;
        const config = await Config.load(fileURLToPath(new URL('../../', import.meta.url)));
        store = createMigrationContextStore(config.configDir);
        await store.save(createMigrationContext({ token: TOKEN }, 'mig_saved'));
        fetch = sinon.stub(globalThis, 'fetch').rejects(new Error('Unexpected network request'));
    });

    afterEach(() => {
        expect(fetch.callCount).to.equal(0);
        sinon.restore();
    });

    it('shows saved context locally without validating the token or changing the file', async () => {
        const before = await fs.readFile(store.path, 'utf8');
        const { stdout, error } = await runCommand('migrations current --json');

        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal({ currentMigrationId: 'mig_saved', source: 'context' });
        expect(await fs.readFile(store.path, 'utf8')).to.equal(before);
        const human = await runCommand('migrations current');
        expect(human.stdout).to.contain('mig_saved (context)');
    });

    it('uses the token from stored credentials', async () => {
        delete process.env.ADAPTY_TOKEN;
        const config = await Config.load(fileURLToPath(new URL('../../', import.meta.url)));
        await createFileSessionStore(config.configDir).save({ token: TOKEN });
        const { stdout } = await runCommand('migrations current --json');

        expect(JSON.parse(stdout)).to.deep.equal({ currentMigrationId: 'mig_saved', source: 'context' });
    });

    for (const token of ['', 'different-token']) {
        it(`has no applicable context with token ${JSON.stringify(token)}`, async () => {
            process.env.ADAPTY_TOKEN = token;
            const { stdout, error } = await runCommand('migrations current --json');

            expect(error).to.equal(undefined);
            expect(JSON.parse(stdout)).to.deep.equal({ currentMigrationId: null, source: null });
            expect((await store.load())?.currentMigrationId).to.equal('mig_saved');
        });
    }

    it('explains how to select a migration when none is saved', async () => {
        await store.clear();
        const { stdout, error } = await runCommand('migrations current');

        expect(error).to.equal(undefined);
        expect(stdout).to.contain('adapty migrations use <id>');
    });

    it('shows an environment override without auth even when context is malformed', async () => {
        delete process.env.ADAPTY_TOKEN;
        process.env.ADAPTY_MIGRATION = 'mig_env';
        await fs.writeFile(store.path, '{broken');
        const { stdout } = await runCommand('migrations current --json');

        expect(JSON.parse(stdout)).to.deep.equal({ currentMigrationId: 'mig_env', source: 'env' });
        const human = await runCommand('migrations current');
        expect(human.stdout).to.contain('mig_env (ADAPTY_MIGRATION)');
    });

    it('ignores an empty environment value', async () => {
        process.env.ADAPTY_MIGRATION = '';
        const { stdout } = await runCommand('migrations current --json');

        expect(JSON.parse(stdout)).to.deep.equal({ currentMigrationId: 'mig_saved', source: 'context' });
    });

    it('rejects a whitespace environment ID instead of falling back', async () => {
        process.env.ADAPTY_MIGRATION = '   ';
        const { error } = await runCommand('migrations current');

        expect(error?.oclif?.exit).to.equal(2);
        expect(error?.code).to.equal('migration_required');
    });

    it('does not accept a migration flag', async () => {
        const { error } = await runCommand('migrations current -m mig_other');

        expect(error?.oclif?.exit).to.equal(2);
    });
});
