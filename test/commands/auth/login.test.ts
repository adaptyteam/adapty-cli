import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { resolveToken } from '../../../src/lib/auth.js';
import { assertFetch, mockFetch, restoreFetch } from '../../helpers/mock-fetch.js';

import type sinon from 'sinon';

const ROOT = join(import.meta.dirname, '..', '..', '..');

const deviceBody = {
    device_code: 'test-device-code',
    expires_in: 300,
    interval: 0,
    user_code: 'TEST-CODE',
    verification_uri: 'https://auth.adapty.io/activate',
    verification_uri_complete: 'https://auth.adapty.io/activate?code=TEST-CODE',
};

const tokenBody = {
    access_token: 'new-token',
    expires_in: 86_400,
    token_type: 'Bearer',
    user: { email: 'test@example.com', name: 'Test User' },
};

describe('auth login', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        delete process.env.ADAPTY_TOKEN;
        fetchStub = mockFetch([deviceBody, tokenBody]);
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_APP_URL;
    });

    /** The link is printed before any polling starts, so an expired code cuts the wait short. */
    const stubShownLinkOnly = (): void => {
        restoreFetch(fetchStub);
        fetchStub = mockFetch([{ ...deviceBody, expires_in: 0 }]);
    };

    it('calls POST /auth/device then POST /auth/token', async () => {
        await runCommand('auth login');
        expect(fetchStub.callCount).to.equal(2);
        assertFetch({ body: { client_id: 'adapty-cli' }, callIndex: 0, method: 'POST', path: '/auth/device/', stub: fetchStub });

        assertFetch({
            body: {
                client_id: 'adapty-cli',
                device_code: 'test-device-code',
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            },
            callIndex: 1,
            method: 'POST',
            path: '/auth/token/',
            stub: fetchStub,
        });
    });

    it('saves the session in the shape the untouched commands read', async () => {
        await runCommand('auth login');

        const config = await Config.load(ROOT);
        const raw = await readFile(join(config.configDir, 'config.json'), 'utf8');

        expect(JSON.parse(raw)).to.deep.equal({
            access_token: 'new-token',
            user: { email: 'test@example.com', name: 'Test User' },
        });

        expect(await resolveToken(config.configDir)).to.equal('new-token');
    });

    it('points the verification link at ADAPTY_APP_URL when one is configured', async () => {
        process.env.ADAPTY_APP_URL = 'http://localhost:3000';
        stubShownLinkOnly();

        const { stdout } = await runCommand('auth login');

        expect(stdout).to.contain('http://localhost:3000/activate?code=TEST-CODE');
        expect(stdout).to.not.contain('https://auth.adapty.io');
    });

    it('leaves the verification link as issued without ADAPTY_APP_URL', async () => {
        stubShownLinkOnly();

        const { stdout } = await runCommand('auth login');

        expect(stdout).to.contain('https://auth.adapty.io/activate?code=TEST-CODE');
    });
});
