import fs from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { createMigrationContext } from '../../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../../src/cli/context/migration/store.js';
import { createFileSessionStore } from '../../../src/sdk/core/session.js';
import { mockFetch, mockFetchFailure } from '../../helpers/mock-fetch.js';

import type { MigrationContextStore } from '../../../src/cli/context/migration/store.js';
import type { SessionStore } from '../../../src/sdk/core/session.js';

describe('auth revoke migration cleanup', () => {
    let context: MigrationContextStore;
    let session: SessionStore;

    beforeEach(async () => {
        const config = await Config.load(join(import.meta.dirname, '..', '..', '..'));
        session = createFileSessionStore(config.configDir);
        context = createMigrationContextStore(config.configDir);
    });

    afterEach(async () => {
        sinon.restore();
        await fs.rm(session.path, { recursive: true, force: true });
        await fs.rm(context.path, { recursive: true, force: true });
    });

    it('revokes on the server before clearing either local file', async () => {
        const saved = createMigrationContext({ token: 'stored-token' }, 'mig_saved');
        await session.save({ token: 'stored-token' });
        await context.save(saved);
        const fetch = mockFetch();

        fetch.callsFake(async () => {
            expect(await session.load()).to.deep.equal({ token: 'stored-token' });
            expect(await context.load()).to.deep.equal(saved);

            return new Response('{}');
        });

        const { stdout, error } = await runCommand('auth revoke --json');

        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal({ env_token_set: false, status: 'revoked' });
        expect(fetch.callCount).to.equal(1);
        expect(await session.load()).to.equal(undefined);
        expect(await context.load()).to.equal(undefined);
    });

    for (const contextToken of ['env-token', 'stored-token']) {
        it(`revokes the env token and only clears context matching it (${contextToken})`, async () => {
            process.env.ADAPTY_TOKEN = 'env-token';
            await session.save({ token: 'stored-token' });
            const saved = createMigrationContext({ token: contextToken }, 'mig_saved');
            await context.save(saved);
            const fetch = mockFetch();
            const { stdout, error } = await runCommand('auth revoke --json');

            expect(error).to.equal(undefined);
            expect(JSON.parse(stdout)).to.deep.equal({ env_token_set: true, status: 'revoked' });
            expect(fetch.callCount).to.equal(1);
            expect(await session.load()).to.deep.equal({ token: 'stored-token' });
            expect(await context.load()).to.deep.equal(contextToken === 'env-token' ? undefined : saved);
        });
    }

    it('clears a matching stored copy of the env token and its context', async () => {
        process.env.ADAPTY_TOKEN = 'same-token';
        await session.save({ token: 'same-token' });
        await context.save(createMigrationContext({ token: 'same-token' }, 'mig_saved'));
        mockFetch();
        const { error } = await runCommand('auth revoke');

        expect(error).to.equal(undefined);
        expect(await session.load()).to.equal(undefined);
        expect(await context.load()).to.equal(undefined);
    });

    it('does not read or clear orphaned context when there is no effective token', async () => {
        await context.save(createMigrationContext({ token: 'old-token' }, 'mig_saved'));
        await fs.writeFile(context.path, '{broken');
        const fetch = mockFetch();
        const { stdout, error } = await runCommand('auth revoke --json');

        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal({ status: 'not_authenticated' });
        expect(fetch.callCount).to.equal(0);
        expect(await fs.readFile(context.path, 'utf8')).to.equal('{broken');
    });

    it('preserves both files after a rejected revoke', async () => {
        await session.save({ token: 'stored-token' });
        const saved = createMigrationContext({ token: 'stored-token' }, 'mig_saved');
        await context.save(saved);
        const fetch = mockFetchFailure({ error: { message: 'Denied' } }, { status: 403 });
        const { error } = await runCommand('auth revoke');

        expect(error?.oclif?.exit).to.equal(3);
        expect(fetch.callCount).to.equal(1);
        expect(await session.load()).to.deep.equal({ token: 'stored-token' });
        expect(await context.load()).to.deep.equal(saved);
    });

    it('reports a context removal failure after clearing matching credentials', async () => {
        await session.save({ token: 'stored-token' });
        const saved = createMigrationContext({ token: 'stored-token' }, 'mig_saved');
        await context.save(saved);

        sinon.stub(fs, 'rm').callThrough().withArgs(context.path, { force: true })
            .rejects(new Error('private filesystem error'));

        const fetch = mockFetch();
        const { error } = await runCommand('auth revoke');

        expect(error?.oclif?.exit).to.equal(1);
        expect(error?.message).to.contain('Token revoked on the server');
        // The store's explanation reaches the user; the error it wrapped does not.
        expect(error?.message).to.contain('Could not remove migration context');
        expect(error?.message).not.to.contain('private filesystem error');
        expect(fetch.callCount).to.equal(1);
        expect(await session.load()).to.equal(undefined);
        expect(await context.load()).to.deep.equal(saved);
    });

    for (const failed of ['session', 'context']) {
        it(`still cleans the other file after a ${failed} cleanup failure without repeating revoke`, async () => {
            process.env.ADAPTY_TOKEN = 'same-token';
            await session.save({ token: 'same-token' });
            await context.save(createMigrationContext({ token: 'same-token' }, 'mig_saved'));
            const broken = failed === 'session' ? session : context;
            await fs.writeFile(broken.path, '{private broken data');
            const fetch = mockFetch();
            const { error, stdout } = await runCommand('auth revoke');

            expect(error?.oclif?.exit).to.equal(1);
            expect(error?.code).to.equal('auth_cleanup_failed');
            expect(error?.message).to.contain('Token revoked on the server');
            expect(error?.message).to.contain('do not repeat revocation');
            expect(error?.message).not.to.contain('private broken data');
            expect(stdout).to.equal('');
            expect(fetch.callCount).to.equal(1);
            expect(await (failed === 'session' ? context : session).load()).to.equal(undefined);
            expect(await fs.readFile(broken.path, 'utf8')).to.equal('{private broken data');
        });
    }
});
