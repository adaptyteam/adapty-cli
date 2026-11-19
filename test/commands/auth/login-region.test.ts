import { readFile, stat } from 'node:fs/promises';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { mockFetch } from '../../helpers/mock-fetch.js';
import { allOn, EU_HOST, sessionPath, urlsOf, US_HOST, writeSession } from '../../helpers/region.js';

const deviceBody = {
    device_code: 'test-device-code',
    expires_in: 300,
    interval: 0,
    user_code: 'WDJB-MJHT',
    verification_uri: 'https://app.adapty.io/cli-auth',
    verification_uri_complete: 'https://app.adapty.io/cli-auth?region=eu&code=WDJB-MJHT',
};

const tokenBody = { access_token: 'token-b', expires_in: 86_400, token_type: 'Bearer', user: { name: 'User B' } };

const EU_SESSION = { access_token: 'token-a', region: 'eu', user: { name: 'User A' } };

type Env = { ADAPTY_REGION?: string };

const setEnv = (env: Env): void => {
    if (env.ADAPTY_REGION !== undefined) {
        process.env.ADAPTY_REGION = env.ADAPTY_REGION;
    }
};

const readSession = async (): Promise<unknown> => JSON.parse(await readFile(await sessionPath(), 'utf8')) as unknown;

/**
 * Admission: external. The region decides which service an account's token is sent to, and the
 * saved session is what every later command reads; an agent drives the login and reads its output.
 */
describe('auth login, region', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        fetchStub = mockFetch([deviceBody, tokenBody]);
    });

    /**
     * A code that expires at once ends the login after the link, before the poll and its wait: enough
     * for the rows about the first call and the output before the link.
     */
    const linkOnly = (): void => {
        sinon.restore();
        fetchStub = mockFetch([{ ...deviceBody, expires_in: 0 }]);
    };

    afterEach(() => {
        sinon.restore();
    });

    // tc_6t879azh: the login calls go to the host of the chosen region
    const chosen: { args: string; env: Env; host: string; id: string; session?: object }[] = [
        { args: '--region eu', env: {}, host: EU_HOST, id: 'flag-eu' },
        { args: '', env: { ADAPTY_REGION: 'eu' }, host: EU_HOST, id: 'env-eu' },
        { args: '--region us', env: { ADAPTY_REGION: 'eu' }, host: US_HOST, id: 'flag-us-over-env-eu' },
        { args: '--region eu', env: { ADAPTY_REGION: 'us' }, host: EU_HOST, id: 'flag-eu-over-env-us' },
        { args: '--region us', env: {}, host: US_HOST, id: 'flag-us-over-eu-session', session: EU_SESSION },
    ];

    for (const row of chosen) {
        it(`tc_6t879azh ${row.id}: every login call goes to ${row.host}`, async () => {
            if (row.session !== undefined) {
                await writeSession(row.session as Record<string, unknown>);
            }

            setEnv(row.env);

            const { error } = await runCommand(`auth login ${row.args}`);

            expect(error, `${row.id}: login failed`).to.equal(undefined);
            expect(allOn(fetchStub, row.host), `${row.id}: calls went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);
        });
    }

    // tc_6zvn8pj0: the login saves its region next to the token
    for (const region of ['eu', 'us']) {
        it(`tc_6zvn8pj0 ${region}: the session file holds the token, the user and region ${region}, mode 0600`, async () => {
            await runCommand(`auth login --region ${region}`);

            expect(await readSession(), `${region}: saved session`).to.deep.equal({
                access_token: 'token-b',
                region,
                user: { name: 'User B' },
            });

            if (process.platform !== 'win32') {
                expect((await stat(await sessionPath())).mode & 0o777, `${region}: file mode`).to.equal(0o600);
            }
        });
    }

    // tc_8bnvgrtg
    it('tc_8bnvgrtg: a US login over an EU session replaces the whole session', async () => {
        await writeSession(EU_SESSION);

        await runCommand('auth login --region us');

        expect(await readSession()).to.deep.equal({ access_token: 'token-b', region: 'us', user: { name: 'User B' } });
    });

    // tc_dti1g8c6: no flag and no ADAPTY_REGION take the region of the current session, else us
    const current: { host: string; id: string; session: Record<string, unknown> | undefined }[] = [
        { host: EU_HOST, id: 'eu-session', session: EU_SESSION },
        { host: US_HOST, id: 'us-session', session: { ...EU_SESSION, region: 'us' } },
        { host: US_HOST, id: 'old-file', session: { access_token: 'token-a', user: { name: 'User A' } } },
        { host: US_HOST, id: 'no-file', session: undefined },
    ];

    for (const row of current) {
        it(`tc_dti1g8c6 ${row.id}: a login with no region goes to ${row.host}`, async () => {
            if (row.session !== undefined) {
                await writeSession(row.session);
            }

            linkOnly();
            await runCommand('auth login');

            expect(allOn(fetchStub, row.host), `${row.id}: calls went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);
        });
    }

    // tc_dq1irj1h: an EU login says where to sign in before the link; a US login prints what it always has
    const LINK_LINE = 'If the browser doesn\'t open, visit: https://app.adapty.io/cli-auth?region=eu&code=WDJB-MJHT';

    const EU_LINE = 'EU account: open the link in a browser signed in through https://app.adapty.io/eu-login; '
        + 'if you are not signed in there, or are signed in as a US account, sign in there first.';

    for (const region of ['eu', 'us']) {
        it(`tc_dq1irj1h ${region}: the eu-login line ${region === 'eu' ? 'comes before' : 'is not in'} the output`, async () => {
            linkOnly();

            const { stdout } = await runCommand(`auth login --region ${region}`);
            const lines = stdout.split('\n');
            const link = lines.indexOf(LINK_LINE);

            expect(link, `${region}: the link is printed as the server gave it`).to.be.greaterThan(-1);

            if (region === 'eu') {
                const hint = lines.indexOf(EU_LINE);

                expect(hint, 'eu: the eu-login line').to.be.greaterThan(-1);
                expect(hint, 'eu: the eu-login line comes before the link').to.be.lessThan(link);
            } else {
                expect(stdout, 'us: no eu-login line').to.not.contain('eu-login');
            }
        });
    }
});
