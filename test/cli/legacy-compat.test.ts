import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { resolveSession } from '../../src/cli/base/adapty/openSession.js';
import { ApiClient } from '../../src/lib/api-client.js';
import { resolveToken } from '../../src/lib/auth.js';
import { readConfig, writeConfig } from '../../src/lib/config.js';
import { createFileSessionStore } from '../../src/sdk/core/session.js';
import { requestOf } from '../helpers/mock-fetch.js';

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
            user: { name: 'Dev' },
        });

        expect(await resolveToken(config.configDir)).to.equal('new-stack-token');

        const stored = await readConfig(config.configDir);
        expect(stored.access_token).to.equal('new-stack-token');
        expect(stored.user).to.deep.equal({ name: 'Dev' });
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

    /**
     * Admission: external. tc_8tjzduo2: a CLI older than regions on the same machine reads the file a
     * new login wrote; the reader and the client below are that CLI's code, which knows no region.
     */
    it('tc_8tjzduo2: lets a reader older than regions use a file with a region, and send to US', async () => {
        await createFileSessionStore(config.configDir).save({ region: 'eu', token: 'new-stack-token', user: { name: 'Dev' } });

        const token = await resolveToken(config.configDir);

        expect(await readConfig(config.configDir)).to.deep.include({ access_token: 'new-stack-token', user: { name: 'Dev' } });

        const stub = sinon.stub(globalThis, 'fetch').resolves(new Response('{}', { headers: { 'content-type': 'application/json' } }));

        try {
            await new ApiClient({ token }).get('/apps');

            expect(requestOf(stub, 0).url).to.equal('https://api-admin.adapty.io/api/v1/developer/apps/');
        } finally {
            stub.restore();
        }
    });

    posix('keeps the file private after either side rewrites it', async () => {
        const path = join(config.configDir, 'config.json');

        await writeConfig({ access_token: 'legacy-token' }, config.configDir);
        await createFileSessionStore(config.configDir).save({ token: 'new-stack-token' });

        expect((await stat(path)).mode & 0o777).to.equal(0o600);
    });
});
