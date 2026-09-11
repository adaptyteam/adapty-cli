import { join } from 'node:path';

import { Config } from '@oclif/core';
import { expect } from 'chai';

import { resolveSession } from '../../src/cli/base/adapty/openSession.js';
import { DEFAULT_ADAPTY_API_URL } from '../../src/sdk/adapty/index.js';
import { createFileSessionStore } from '../../src/sdk/core/session.js';

const ROOT = join(import.meta.dirname, '..', '..');

describe('resolveSession', () => {
    let config: Config;

    before(async () => {
        config = await Config.load(ROOT);
    });

    beforeEach(async () => {
        delete process.env.ADAPTY_TOKEN;
        delete process.env.ADAPTY_API_URL;
        await createFileSessionStore(config.configDir).clear();
    });

    it('defaults to the developer API and finds no token on a clean machine', async () => {
        const session = await resolveSession(config);

        expect(session.apiUrl).to.equal(DEFAULT_ADAPTY_API_URL);
        expect(session.token).to.equal(undefined);
        expect(session.user).to.equal(undefined);
    });

    it('takes the API URL from ADAPTY_API_URL', async () => {
        process.env.ADAPTY_API_URL = 'https://staging.example.com/api/v1/developer';

        const session = await resolveSession(config);

        expect(session.apiUrl).to.equal('https://staging.example.com/api/v1/developer');
    });

    it('reads the stored session, user included', async () => {
        await createFileSessionStore(config.configDir).save({
            token: 'stored-token',
            user: { email: 'dev@example.com', name: 'Dev' },
        });

        const session = await resolveSession(config);

        expect(session.token).to.equal('stored-token');
        expect(session.user).to.deep.equal({ email: 'dev@example.com', name: 'Dev' });
    });

    it('lets ADAPTY_TOKEN win over the stored session, and carries no user with it', async () => {
        await createFileSessionStore(config.configDir).save({
            token: 'stored-token',
            user: { email: 'dev@example.com', name: 'Dev' },
        });

        process.env.ADAPTY_TOKEN = 'env-token';

        const session = await resolveSession(config);

        expect(session.token).to.equal('env-token');
        expect(session.user).to.equal(undefined);
    });

    it('ignores an empty ADAPTY_TOKEN, as the published CLI does', async () => {
        await createFileSessionStore(config.configDir).save({ token: 'stored-token' });
        process.env.ADAPTY_TOKEN = '';

        const session = await resolveSession(config);

        expect(session.token).to.equal('stored-token');
    });

    it('points the store at config.json inside oclif config dir', async () => {
        const session = await resolveSession(config);

        expect(session.store.path).to.equal(join(config.configDir, 'config.json'));
    });
});
