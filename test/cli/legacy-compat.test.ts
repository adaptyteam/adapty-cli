import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { expect } from 'chai';

import { resolveSession } from '../../src/cli/base/adapty/openSession.js';
import { resolveToken } from '../../src/lib/auth.js';
import { readConfig, writeConfig } from '../../src/lib/config.js';
import { createFileSessionStore } from '../../src/sdk/core/session.js';

const ROOT = join(import.meta.dirname, '..', '..');
const posix = process.platform === 'win32' ? it.skip : it;

/**
 * The session file is the only thing the migrated commands and the untouched ones share. These
 * tests are that contract, in both directions, for as long as src/lib and src/cli coexist.
 */
describe('session file, shared by both stacks', () => {
    let config: Config;

    before(async () => {
        config = await Config.load(ROOT);
    });

    beforeEach(async () => {
        delete process.env.ADAPTY_TOKEN;
        delete process.env.ADAPTY_API_URL;
        await createFileSessionStore(config.configDir).clear();
    });

    it('lets a legacy command use a token the new store saved', async () => {
        await createFileSessionStore(config.configDir).save({
            token: 'new-stack-token',
            user: { email: 'dev@example.com', name: 'Dev' },
        });

        expect(await resolveToken(config.configDir)).to.equal('new-stack-token');

        // `auth status` calls itself authenticated only when both fields are there
        const stored = await readConfig(config.configDir);
        expect(stored.access_token).to.equal('new-stack-token');
        expect(stored.user).to.deep.equal({ email: 'dev@example.com', name: 'Dev' });
    });

    it('lets a new command use a token a legacy login saved', async () => {
        await writeConfig({ access_token: 'legacy-token', user: { email: 'dev@example.com', name: 'Dev' } }, config.configDir);

        const session = await resolveSession(config);

        expect(session.token).to.equal('legacy-token');
        expect(session.user).to.deep.equal({ email: 'dev@example.com', name: 'Dev' });
    });

    it('reads a legacy logout, which empties the file instead of removing it', async () => {
        await writeConfig({ access_token: 'legacy-token' }, config.configDir);
        await writeConfig({}, config.configDir);

        const session = await resolveSession(config);

        expect(session.token).to.equal(undefined);
    });

    it('survives a new logout, which removes the file the legacy code expects', async () => {
        await createFileSessionStore(config.configDir).save({ token: 'new-stack-token' });
        await createFileSessionStore(config.configDir).clear();

        expect(await resolveToken(config.configDir)).to.equal(null);
        expect(await readConfig(config.configDir)).to.deep.equal({});
    });

    posix('keeps the file private after either side rewrites it', async () => {
        const path = join(config.configDir, 'config.json');

        await writeConfig({ access_token: 'legacy-token' }, config.configDir);
        await createFileSessionStore(config.configDir).save({ token: 'new-stack-token' });

        expect((await stat(path)).mode & 0o777).to.equal(0o600);
    });
});
