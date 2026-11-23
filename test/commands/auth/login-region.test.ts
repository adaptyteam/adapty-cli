import { readFile, stat } from 'node:fs/promises';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { mockFetch } from '../../helpers/mock-fetch.js';
import { allOn, EU_HOST, sessionPath, urlsOf, US_HOST, writeSession, writeTruncatedSession } from '../../helpers/region.js';

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

    // A login with a region named needs nothing from the file it replaces, so a damaged one does not stop
    // it: the login is how the user repairs the file. With no region named, the region has to come from
    // the file, so the login stops at it like any other command.
    type Damaged = 'malformed-region' | 'truncated' | 'unknown-region';

    const writeDamaged = async (kind: Damaged): Promise<void> => {
        if (kind === 'truncated') {
            await writeTruncatedSession();
        } else {
            await writeSession({ access_token: 'token-a', region: kind === 'unknown-region' ? 'ap' : 42 });
        }
    };

    const repairs: { args: string; damage: Damaged; env: Env; host: string; id: string; region: string }[] = [
        { args: '--region eu', damage: 'truncated', env: {}, host: EU_HOST, id: 'truncated-flag-eu', region: 'eu' },
        { args: '--region us', damage: 'unknown-region', env: {}, host: US_HOST, id: 'unknown-region-flag-us', region: 'us' },
        { args: '', damage: 'malformed-region', env: { ADAPTY_REGION: 'eu' }, host: EU_HOST, id: 'malformed-region-env-eu', region: 'eu' },
    ];

    for (const row of repairs) {
        it(`${row.id}: the login goes to ${row.host} and replaces the damaged file`, async () => {
            await writeDamaged(row.damage);
            setEnv(row.env);

            const { error } = await runCommand(`auth login ${row.args}`);

            expect(error, `${row.id}: login failed`).to.equal(undefined);
            expect(allOn(fetchStub, row.host), `${row.id}: calls went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);

            expect(await readSession(), `${row.id}: saved session`).to.deep.equal({
                access_token: 'token-b',
                region: row.region,
                user: { name: 'User B' },
            });
        });
    }

    for (const kind of ['truncated', 'unknown-region'] as const) {
        it(`${kind}, no region named: the login stops at the damaged file, exit 3, no request`, async () => {
            await writeDamaged(kind);
            const before = await readFile(await sessionPath(), 'utf8');

            const { error } = await runCommand('auth login');

            expect(error?.oclif?.exit, `${kind}: exit code`).to.equal(3);

            expect(error?.message.split('\n'), `${kind}: error text`).to.deep.equal([
                `Session file is corrupted: ${await sessionPath()}`,
                'Delete the file and run `adapty auth login` again.',
            ]);

            expect(urlsOf(fetchStub), `${kind}: requests sent`).to.deep.equal([]);
            expect(await readFile(await sessionPath(), 'utf8'), `${kind}: file`).to.equal(before);
        });
    }

    // tc_dq1irj1h: an EU login says where to sign in before the link; a US login prints what it always has.
    // The eu-app-url row: ADAPTY_APP_URL moves the link and keeps ?region=eu&code=.
    const LINK = 'If the browser doesn\'t open, visit: ';

    const EU_LINE = 'EU account: open the link in a browser signed in through https://app.adapty.io/eu-login; '
        + 'if you are not signed in there, or are signed in as a US account, sign in there first.';

    const printedLinks: { appUrl?: string; id: string; link: string; region: string }[] = [
        { id: 'eu', link: 'https://app.adapty.io/cli-auth?region=eu&code=WDJB-MJHT', region: 'eu' },
        { id: 'us', link: 'https://app.adapty.io/cli-auth?region=eu&code=WDJB-MJHT', region: 'us' },
        {
            appUrl: 'https://dashboard.example.com',
            id: 'eu-app-url',
            link: 'https://dashboard.example.com/cli-auth?region=eu&code=WDJB-MJHT',
            region: 'eu',
        },
    ];

    for (const row of printedLinks) {
        it(`tc_dq1irj1h ${row.id}: the eu-login line ${row.region === 'eu' ? 'comes before' : 'is not in'} the output`, async () => {
            linkOnly();

            if (row.appUrl !== undefined) {
                process.env.ADAPTY_APP_URL = row.appUrl;
            }

            try {
                const { stdout } = await runCommand(`auth login --region ${row.region}`);
                const lines = stdout.split('\n');
                const link = lines.indexOf(`${LINK}${row.link}`);

                expect(link, `${row.id}: the link ${row.link}`).to.be.greaterThan(-1);

                if (row.region === 'eu') {
                    const hint = lines.indexOf(EU_LINE);

                    expect(hint, `${row.id}: the eu-login line`).to.be.greaterThan(-1);
                    expect(hint, `${row.id}: the eu-login line comes before the link`).to.be.lessThan(link);
                } else {
                    expect(stdout, `${row.id}: no eu-login line`).to.not.contain('eu-login');
                }
            } finally {
                delete process.env.ADAPTY_APP_URL;
            }
        });
    }
});
