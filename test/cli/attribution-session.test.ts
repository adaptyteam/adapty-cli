import { join } from 'node:path';

import { Config } from '@oclif/core';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { resolveAttributionSession } from '../../src/cli/base/attribution/openSession.js';
import { DEFAULT_ATTRIBUTION_API_URL } from '../../src/sdk/attribution/index.js';
import { createFileSessionStore } from '../../src/sdk/core/session.js';

const ROOT = join(import.meta.dirname, '..', '..');

describe('resolveAttributionSession', () => {
    let config: Config;

    before(async () => {
        config = await Config.load(ROOT);
    });

    beforeEach(async () => {
        delete process.env.ADAPTY_TOKEN;
        delete process.env.ADAPTY_API_URL;
        delete process.env.ADAPTY_ATTRIBUTION_API_URL;
        await createFileSessionStore(config.configDir).clear();
    });

    afterEach(() => {
        delete process.env.ADAPTY_API_URL;
        delete process.env.ADAPTY_ATTRIBUTION_API_URL;
    });

    it('defaults to the attribution API and finds no token on a clean machine', async () => {
        const session = await resolveAttributionSession(config);

        expect(session.apiUrl).to.equal(DEFAULT_ATTRIBUTION_API_URL);
        expect(session.token).to.equal(undefined);
        expect(session.user).to.equal(undefined);
    });

    it('takes the API URL from ADAPTY_ATTRIBUTION_API_URL', async () => {
        process.env.ADAPTY_ATTRIBUTION_API_URL = 'https://ua.staging.example.com/api/v1/cli';

        const session = await resolveAttributionSession(config);

        expect(session.apiUrl).to.equal('https://ua.staging.example.com/api/v1/cli');
    });

    it('stays on the attribution default when only ADAPTY_API_URL is redirected', async () => {
        process.env.ADAPTY_API_URL = 'https://staging.example.com/api/v1/developer';

        const session = await resolveAttributionSession(config);

        expect(session.apiUrl).to.equal(DEFAULT_ATTRIBUTION_API_URL);
    });

    it('carries the stored token, the user and the store of the Adapty session', async () => {
        await createFileSessionStore(config.configDir).save({
            token: 'stored-token',
            user: { email: 'dev@example.com', name: 'Dev' },
        });

        const session = await resolveAttributionSession(config);

        expect(session.token).to.equal('stored-token');
        expect(session.user).to.deep.equal({ email: 'dev@example.com', name: 'Dev' });
        expect(session.store.path).to.equal(join(config.configDir, 'config.json'));
    });

    it('lets ADAPTY_TOKEN win over the stored session, as the Adapty session does', async () => {
        await createFileSessionStore(config.configDir).save({ token: 'stored-token' });
        process.env.ADAPTY_TOKEN = 'env-token';

        const session = await resolveAttributionSession(config);

        expect(session.token).to.equal('env-token');
    });

    it('resolves without a warning, even for a non-default URL: warning is openSession\'s job', async () => {
        process.env.ADAPTY_ATTRIBUTION_API_URL = 'https://ua.staging.example.com/api/v1/cli';

        const write = sinon.stub(process.stderr, 'write');

        try {
            await resolveAttributionSession(config);
        } finally {
            write.restore();
        }

        expect(write.callCount).to.equal(0);
    });
});
