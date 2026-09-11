import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../../src/cli/errors.js';
import { createFileSessionStore } from '../../../src/sdk/core/session.js';
import { assertFetch, mockFetch, mockFetchFailure, restoreFetch } from '../../helpers/mock-fetch.js';

import type sinon from 'sinon';

const ROOT = join(import.meta.dirname, '..', '..', '..');

describe('auth revoke', () => {
    let config: Config;
    let fetchStub: sinon.SinonStub;

    before(async () => {
        config = await Config.load(ROOT);
    });

    beforeEach(() => {
        delete process.env.ADAPTY_TOKEN;
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('succeeds without a token in human and JSON modes', async () => {
        fetchStub = mockFetch([{}]);

        const human = await runCommand('auth revoke');

        expect(human.error).to.equal(undefined);
        expect(human.stdout).to.contain('Not currently authenticated.');

        const json = await runCommand('auth revoke --json');

        expect(json.error).to.equal(undefined);
        expect(JSON.parse(json.stdout)).to.deep.equal({ status: 'not_authenticated' });
        expect(fetchStub.callCount).to.equal(0);

        // Command.catch can swallow a JSON error, so verify the real process exit as well.
        for (const flags of [[], ['--json']]) {
            const child = spawnSync(process.execPath, [join(ROOT, 'bin/run.js'), 'auth', 'revoke', ...flags], {
                encoding: 'utf8',
                timeout: 10_000,
            });

            expect(child.status, child.stderr).to.equal(0);
        }
    });

    it('sends the stored token to the server, then forgets the session', async () => {
        await createFileSessionStore(config.configDir).save({ token: 'stored-token' });
        fetchStub = mockFetch([{}]);

        const { stdout } = await runCommand('auth revoke');

        assertFetch({ body: { token: 'stored-token' }, callIndex: 0, method: 'POST', path: '/auth/tokens/revoke/', stub: fetchStub });
        expect(stdout).to.contain('Token revoked');
        expect(await createFileSessionStore(config.configDir).load()).to.equal(undefined);

        const repeated = await runCommand('auth revoke --json');

        expect(JSON.parse(repeated.stdout)).to.deep.equal({ status: 'not_authenticated' });
        expect(fetchStub.callCount).to.equal(1);
    });

    /** The order matters: a session dropped before a failed request could never be revoked. */
    it('keeps the session when the server refuses to revoke', async () => {
        await createFileSessionStore(config.configDir).save({ token: 'stored-token' });
        fetchStub = mockFetchFailure({ error_code: 'server_error' }, { status: 500 });

        const { error } = await runCommand('auth revoke');

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(await createFileSessionStore(config.configDir).load()).to.deep.equal({ token: 'stored-token' });
    });

    it('warns that a revoked env token is still in the environment', async () => {
        process.env.ADAPTY_TOKEN = 'env-token';
        fetchStub = mockFetch([{}]);

        const { stdout } = await runCommand('auth revoke');

        expect(stdout).to.contain('ADAPTY_TOKEN is still set');

        assertFetch({ body: { token: 'env-token' }, callIndex: 0, method: 'POST', path: '/auth/tokens/revoke/', stub: fetchStub });
    });

    it('preserves a different stored session when revoking the environment token', async () => {
        const stored = { token: 'stored-token', user: { email: 'dev@example.com', name: 'Dev' } };

        await createFileSessionStore(config.configDir).save(stored);
        process.env.ADAPTY_TOKEN = 'env-token';
        fetchStub = mockFetch([{}]);

        const { stdout } = await runCommand('auth revoke --json');

        assertFetch({ body: { token: 'env-token' }, callIndex: 0, method: 'POST', path: '/auth/tokens/revoke/', stub: fetchStub });
        expect(JSON.parse(stdout)).to.deep.equal({ env_token_set: true, status: 'revoked' });
        expect(await createFileSessionStore(config.configDir).load()).to.deep.equal(stored);
    });

    it('removes a stored copy of the revoked environment token', async () => {
        await createFileSessionStore(config.configDir).save({ token: 'same-token' });
        process.env.ADAPTY_TOKEN = 'same-token';
        fetchStub = mockFetch([{}]);

        await runCommand('auth revoke');

        assertFetch({ body: { token: 'same-token' }, callIndex: 0, method: 'POST', path: '/auth/tokens/revoke/', stub: fetchStub });
        expect(await createFileSessionStore(config.configDir).load()).to.equal(undefined);
    });
});
