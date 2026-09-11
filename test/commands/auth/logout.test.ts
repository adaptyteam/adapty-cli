import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { readConfig } from '../../../src/lib/config.js';
import { createFileSessionStore } from '../../../src/sdk/core/session.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');

describe('auth logout', () => {
    let config: Config;

    before(async () => {
        config = await Config.load(ROOT);
    });

    beforeEach(() => {
        delete process.env.ADAPTY_TOKEN;
    });

    it('says so when there was nothing to remove', async () => {
        const { stdout } = await runCommand('auth logout');

        expect(stdout).to.contain('Not currently authenticated');
    });

    it('removes the stored session and warns that the token still lives server-side', async () => {
        await createFileSessionStore(config.configDir).save({ token: 'stored-token' });

        const { stdout } = await runCommand('auth logout');

        expect(stdout).to.contain('Logged out');
        expect(stdout).to.contain('auth revoke');
        expect(await readConfig(config.configDir)).to.deep.equal({});
    });

    it('admits that ADAPTY_TOKEN keeps the CLI authenticated', async () => {
        process.env.ADAPTY_TOKEN = 'env-token';

        const { stdout } = await runCommand('auth logout');

        expect(stdout).to.contain('ADAPTY_TOKEN is still set');
    });

    it('reports the env token in --json as well', async () => {
        process.env.ADAPTY_TOKEN = 'env-token';

        const { stdout } = await runCommand('auth logout --json');

        expect(JSON.parse(stdout)).to.deep.equal({ env_token_set: true, status: 'not_authenticated' });
    });
});
