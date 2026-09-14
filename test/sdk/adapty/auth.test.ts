import { expect } from 'chai';

import { createAdapty, DEFAULT_ADAPTY_API_URL } from '../../../src/sdk/adapty/index.js';
import { runDeviceFlow } from '../../../src/sdk/core/auth/device-flow.js';
import { ApiError } from '../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

import type { PollResult } from '../../../src/sdk/core/auth/device-flow.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const setup = (script: Script, token?: string) => {
    const scripted = createScriptedFetch(script);
    const clock = createFakeClock();

    const adapty = createAdapty({
        clock,
        fetch: scripted.fetch,
        token,
        userAgent: 'adapty-cli/test',
    });

    return { adapty, calls: scripted.calls, clock };
};

const deviceResponse = {
    device_code: 'dc_1',
    expires_in: 600,
    user_code: 'WDJB-MJHT',
    verification_uri: 'https://app.adapty.io/activate',
    verification_uri_complete: 'https://app.adapty.io/activate?code=WDJB-MJHT',
};

const tokenResponse = {
    access_token: 'tok_1',
    expires_in: 3600,
    token_type: 'Bearer',
    user: { email: 'dev@example.com', name: 'Dev' },
};

describe('adapty.auth', () => {
    it('asks for a device code on the product path and hands core the shape the port declares', async () => {
        const { adapty, calls } = setup([{ body: deviceResponse }]);

        const code = await adapty.auth.requestDeviceCode();

        expect(calls[0]?.url).to.equal(`${DEFAULT_ADAPTY_API_URL}/auth/device/`);
        expect(calls[0]?.body).to.equal('{"client_id":"adapty-cli"}');
        expect(calls[0]?.headers.get('user-agent')).to.equal('adapty-cli/test');

        expect(code).to.deep.equal({
            deviceCode: 'dc_1',
            expiresInSec: 600,
            intervalSec: 5,
            userCode: 'WDJB-MJHT',
            verificationUri: 'https://app.adapty.io/activate',
            verificationUriComplete: 'https://app.adapty.io/activate?code=WDJB-MJHT',
        });
    });

    it('takes the poll interval from the server when it sends one', async () => {
        const { adapty } = setup([{ body: { ...deviceResponse, interval_seconds: 3 } }]);

        expect((await adapty.auth.requestDeviceCode()).intervalSec).to.equal(3);
    });

    it('reads an issued token into the domain shape', async () => {
        const { adapty, calls } = setup([{ body: tokenResponse }]);

        expect(await adapty.auth.pollToken('dc_1')).to.deep.equal({
            status: 'authorized',
            token: {
                accessToken: 'tok_1',
                expiresInSec: 3600,
                user: { email: 'dev@example.com', name: 'Dev' },
            },
        });

        expect(calls[0]?.url).to.equal(`${DEFAULT_ADAPTY_API_URL}/auth/token/`);
    });

    it('turns the protocol codes into states instead of errors', async () => {
        const expected: Record<string, PollResult<never>['status']> = {
            access_denied: 'denied',
            authorization_pending: 'pending',
            expired_token: 'expired',
            slow_down: 'slow_down',
        };

        for (const [code, status] of Object.entries(expected)) {
            const { adapty } = setup([{ status: 400, body: { error: code } }]);

            expect(await adapty.auth.pollToken('dc_1'), code).to.deep.equal({ status });
        }
    });

    it('reads a protocol code out of a 200 as well, so a pending login is never called authorized', async () => {
        const { adapty } = setup([{ body: { error: 'authorization_pending' } }]);

        expect(await adapty.auth.pollToken('dc_1')).to.deep.equal({ status: 'pending' });
    });

    it('refuses a 200 whose code means nothing to the protocol', async () => {
        const { adapty } = setup([{ body: { error: 'teapot' } }]);

        const error = await rejection(adapty.auth.pollToken('dc_1'));

        expect(error).to.be.instanceOf(ApiError);
        expect((error as ApiError).code).to.equal('teapot');
        expect((error as ApiError).message).to.contain('Unexpected device flow response');
    });

    it('lets a real failure through: an unknown code is not a state', async () => {
        const { adapty } = setup([{ status: 500, body: { error: 'internal_error' } }]);

        const error = await rejection(adapty.auth.pollToken('dc_1'));

        expect(error).to.be.instanceOf(ApiError);
        expect((error as ApiError).code).to.equal('internal_error');
    });

    it('is accepted by runDeviceFlow as the port itself, with no adapter in between', async () => {
        const { adapty, clock } = setup([
            { body: deviceResponse },
            { status: 400, body: { error: 'authorization_pending' } },
            { body: tokenResponse },
        ]);

        const shown: string[] = [];

        const token = await runDeviceFlow(adapty.auth, {
            clock,
            onCode: code => shown.push(code.userCode),
        });

        expect(token.accessToken).to.equal('tok_1');
        expect(shown).to.deep.equal(['WDJB-MJHT']);
        expect(clock.sleeps).to.deep.equal([5000, 5000]);
    });

    it('sends the bearer token on the calls that need one', async () => {
        const { adapty, calls } = setup([{ status: 204 }, { body: { email: 'dev@example.com' } }], 'tok_stored');

        await adapty.auth.revokeToken('tok_stored');
        expect(await adapty.auth.me()).to.deep.equal({ email: 'dev@example.com' });

        expect(calls[0]?.url).to.equal(`${DEFAULT_ADAPTY_API_URL}/auth/tokens/revoke/`);
        expect(calls[0]?.headers.get('authorization')).to.equal('Bearer tok_stored');
        expect(calls[1]?.url).to.equal(`${DEFAULT_ADAPTY_API_URL}/me/`);
    });
});
