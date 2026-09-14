import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { createFileSessionStore } from '../../../src/sdk/core/session.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');

describe('auth status', () => {
    let config: Config;

    before(async () => {
        config = await Config.load(ROOT);
    });

    it('shows not authenticated when no config', async () => {
        const { stdout } = await runCommand('auth status');
        expect(stdout).to.contain('Not authenticated');
    });

    it('returns json when --json flag passed', async () => {
        const { stdout } = await runCommand('auth status --json');
        const result = JSON.parse(stdout) as { authenticated: boolean; source: string };

        expect(result.authenticated).to.equal(false);
        expect(result.source).to.equal('none');
    });

    it('reads the stored session without touching the network', async () => {
        await createFileSessionStore(config.configDir).save({
            token: 'stored-token-1234',
            user: { email: 'dev@example.com', name: 'Dev' },
        });

        const { stdout } = await runCommand('auth status');

        expect(stdout).to.contain('Email: dev@example.com');
        expect(stdout).to.contain('Token: stored-t****');
        expect(stdout).to.contain(`Config: ${join(config.configDir, 'config.json')}`);
        expect(stdout).to.not.contain('stored-token-1234');
    });

    /** The published CLI reports "not authenticated" here, while every other command works. */
    it('counts an env token as authenticated and names it as the source', async () => {
        process.env.ADAPTY_TOKEN = 'env-token-987654';

        const { stdout } = await runCommand('auth status');

        expect(stdout).to.contain('Source: ADAPTY_TOKEN (environment)');
        expect(stdout).to.contain('Token: env-toke****');

        const json = await runCommand('auth status --json');

        expect(JSON.parse(json.stdout)).to.deep.include({ authenticated: true, source: 'env' });
    });
});
