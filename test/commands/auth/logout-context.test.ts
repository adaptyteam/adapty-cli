import fs from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { createMigrationContext } from '../../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../../src/cli/context/migration/store.js';
import { createFileSessionStore } from '../../../src/sdk/core/session.js';

import type { MigrationContextStore } from '../../../src/cli/context/migration/store.js';
import type { SessionStore } from '../../../src/sdk/core/session.js';

describe('auth logout migration cleanup', () => {
    let context: MigrationContextStore;
    let session: SessionStore;
    let fetch: sinon.SinonStub;

    beforeEach(async () => {
        const config = await Config.load(join(import.meta.dirname, '..', '..', '..'));
        session = createFileSessionStore(config.configDir);
        context = createMigrationContextStore(config.configDir);
        await context.save(createMigrationContext({ token: 'old-token' }, 'mig_saved'));
        fetch = sinon.stub(globalThis, 'fetch').rejects(new Error('Logout must stay offline'));
    });

    afterEach(async () => {
        sinon.restore();
        await fs.rm(session.path, { recursive: true, force: true });
        await fs.rm(context.path, { recursive: true, force: true });
        expect(fetch.callCount).to.equal(0);
    });

    it('clears orphaned context without credentials, preserving the JSON result', async () => {
        const { stdout, error } = await runCommand('auth logout --json');

        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal({ env_token_set: false, status: 'not_authenticated' });
        expect(await context.load()).to.equal(undefined);
    });

    it('removes credentials and context belonging to a different token from the environment', async () => {
        await session.save({ token: 'stored-token' });
        process.env.ADAPTY_TOKEN = 'env-token';
        const { stdout, error } = await runCommand('auth logout --json');

        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal({ env_token_set: true, status: 'logged_out' });
        expect(await session.load()).to.equal(undefined);
        expect(await context.load()).to.equal(undefined);
        expect(process.env.ADAPTY_TOKEN).to.equal('env-token');
    });

    it('can remove malformed credentials and context', async () => {
        await fs.writeFile(session.path, '{broken');
        await fs.writeFile(context.path, '{broken');
        const { error } = await runCommand('auth logout');

        expect(error).to.equal(undefined);
        expect(await session.load()).to.equal(undefined);
        expect(await context.load()).to.equal(undefined);
    });

    for (const failed of ['session', 'context', 'both']) {
        it(`attempts both removals and reports incomplete cleanup when ${failed} cannot be removed`, async () => {
            await session.save({ token: 'stored-token' });

            for (const store of failed === 'both' ? [session, context] : [failed === 'session' ? session : context]) {
                await fs.rm(store.path);
                await fs.mkdir(store.path);
            }

            const { error, stdout } = await runCommand('auth logout');

            expect(error?.oclif?.exit).to.equal(1);
            expect(error?.code).to.equal('auth_cleanup_failed');
            expect(error?.message).to.contain('cleanup is incomplete');
            expect(stdout).to.equal('');

            // Why each file survived, not only its path: an errno for a failure that is not ours,
            // the context store's own explanation for the one that is.
            if (failed !== 'context') {
                expect(error?.message).to.contain(session.path).and.contain('EISDIR');
            }

            if (failed !== 'session') {
                expect(error?.message).to.contain('Could not remove migration context');
            }

            if (failed !== 'both') {
                expect(await (failed === 'session' ? context : session).load()).to.equal(undefined);
            }
        });
    }

    for (const json of [false, true]) {
        it(`warns about a surviving migration environment override (json=${json})`, async () => {
            process.env.ADAPTY_MIGRATION = 'mig_env';
            const { stderr, error } = await runCommand(`auth logout${json ? ' --json' : ''}`);

            expect(error).to.equal(undefined);
            expect(stderr).to.contain('ADAPTY_MIGRATION still supplies');
            expect(stderr).to.contain('Unset it');
            expect(process.env.ADAPTY_MIGRATION).to.equal('mig_env');
            expect(await context.load()).to.equal(undefined);
        });
    }
});
