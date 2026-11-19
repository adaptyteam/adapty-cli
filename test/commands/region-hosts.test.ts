import { rm } from 'node:fs/promises';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { EMPTY_LIST_RESPONSE, mockFetch, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';
import {
    allOn, bearerOf, EU_HOST, REGION_WORDS, sessionPath, urlsOf, US_HOST, writeSession, writeTruncatedSession,
    writeUnreadableSession,
} from '../helpers/region.js';

import type * as sinon from 'sinon';

const SHARED = 'apps list';
const OLD = `access-levels list --app ${TEST_APP_ID}`;
const DEV = 'https://dev.example.com/api/v1/developer';

const EU_FILE = { access_token: 'file-token', region: 'eu', user: { name: 'Dev' } };

type Env = Partial<Record<'ADAPTY_API_URL' | 'ADAPTY_REGION' | 'ADAPTY_TOKEN', string>>;

const setEnv = (env: Env): void => {
    for (const [key, value] of Object.entries(env)) {
        process.env[key] = value;
    }
};

/**
 * Admission: external. Which service receives an account's token, the exit code and the error text
 * that an agent reads and acts on, and the warning a person sees on stderr. Both CLI stacks: the
 * shared one (`apps list`) and the old one (`access-levels list`).
 */
describe('region of a command', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);
    });

    afterEach(async () => {
        restoreFetch(fetchStub);
        // A directory in place of the file outlives the shared hook, which removes files only
        await rm(await sessionPath(), { force: true, recursive: true });
    });

    // tc_16j38w7h: a bad region value is a usage error naming us and eu, and nothing is sent
    const bad: { command: string; env: Env; id: string }[] = [
        { command: 'auth login --region xx', env: {}, id: 'login-flag' },
        { command: 'auth login', env: { ADAPTY_REGION: 'xx' }, id: 'login-env' },
        { command: SHARED, env: { ADAPTY_REGION: 'xx', ADAPTY_TOKEN: 'env-token' }, id: 'shared-env' },
        { command: OLD, env: { ADAPTY_REGION: 'xx', ADAPTY_TOKEN: 'env-token' }, id: 'old-env' },
    ];

    for (const row of bad) {
        it(`tc_16j38w7h ${row.id}: exit 2 naming us and eu, no request`, async () => {
            setEnv(row.env);

            const { error } = await runCommand(row.command);

            expect(error?.oclif?.exit, `${row.id}: exit code`).to.equal(2);
            expect(error?.message, `${row.id}: names us`).to.match(/\bus\b/);
            expect(error?.message, `${row.id}: names eu`).to.match(/\beu\b/);
            expect(fetchStub.callCount, `${row.id}: requests sent`).to.equal(0);
        });
    }

    it('tc_ikz9jizb: --region on another command is an unknown flag, exit 2, no request', async () => {
        process.env.ADAPTY_TOKEN = 'env-token';

        const { error } = await runCommand(`${SHARED} --region eu`);

        expect(error?.oclif?.exit).to.equal(2);
        expect(error?.message).to.contain('Nonexistent flag: --region');
        expect(fetchStub.callCount).to.equal(0);
    });

    // tc_ucxhrx9k: a developer API command goes to the host of the region of the command, in both stacks
    const routed: { command: string; env: Env; file?: object; host: string; id: string }[] = [
        { command: SHARED, env: {}, file: EU_FILE, host: EU_HOST, id: 'shared-eu-session' },
        { command: OLD, env: {}, file: EU_FILE, host: EU_HOST, id: 'old-eu-session' },
        { command: SHARED, env: { ADAPTY_REGION: 'eu', ADAPTY_TOKEN: 'env-token' }, host: EU_HOST, id: 'shared-env-token-env-region' },
        { command: OLD, env: { ADAPTY_REGION: 'eu', ADAPTY_TOKEN: 'env-token' }, host: EU_HOST, id: 'old-env-token-env-region' },
        { command: SHARED, env: { ADAPTY_TOKEN: 'env-token' }, file: EU_FILE, host: EU_HOST, id: 'shared-env-token-saved-eu' },
        { command: OLD, env: { ADAPTY_TOKEN: 'env-token' }, file: EU_FILE, host: EU_HOST, id: 'old-env-token-saved-eu' },
        { command: SHARED, env: { ADAPTY_REGION: 'us' }, file: EU_FILE, host: US_HOST, id: 'shared-env-us-over-saved-eu' },
        { command: OLD, env: { ADAPTY_REGION: 'us' }, file: EU_FILE, host: US_HOST, id: 'old-env-us-over-saved-eu' },
        { command: SHARED, env: { ADAPTY_TOKEN: 'env-token' }, host: US_HOST, id: 'shared-nothing' },
        { command: 'auth whoami', env: {}, file: EU_FILE, host: EU_HOST, id: 'whoami-eu' },
    ];

    for (const row of routed) {
        it(`tc_ucxhrx9k ${row.id}: the request goes to ${row.host}, with no warning`, async () => {
            if (row.file !== undefined) {
                await writeSession(row.file as Record<string, unknown>);
            }

            setEnv(row.env);

            const { error, stderr } = await runCommand(row.command);

            expect(error, `${row.id}: command failed`).to.equal(undefined);
            expect(allOn(fetchStub, row.host), `${row.id}: requests went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);
            expect(stderr, `${row.id}: warning`).to.not.contain('non-default');
        });
    }

    // tc_yeg2tr0f: ADAPTY_API_URL wins over the region; each stack warns as before, against the US default
    const sharedWarning = (url: string): string => `Warning: Using non-default API URL: ${url}`;
    const oldWarning = (url: string): string => `Warning: using non-default API URL: ${url}`;

    const overridden: { apiUrl: string; command: string; id: string; region: string; warning: string | undefined }[] = [
        { apiUrl: DEV, command: SHARED, id: 'shared-dev', region: 'eu', warning: sharedWarning(DEV) },
        { apiUrl: DEV, command: OLD, id: 'old-dev', region: 'eu', warning: oldWarning(DEV) },
        { apiUrl: US_HOST, command: SHARED, id: 'shared-us-default', region: 'eu', warning: undefined },
        { apiUrl: US_HOST, command: OLD, id: 'old-us-default', region: 'eu', warning: undefined },
        { apiUrl: EU_HOST, command: SHARED, id: 'shared-eu-host', region: 'us', warning: sharedWarning(EU_HOST) },
        { apiUrl: EU_HOST, command: OLD, id: 'old-eu-host', region: 'us', warning: oldWarning(EU_HOST) },
    ];

    for (const row of overridden) {
        it(`tc_yeg2tr0f ${row.id}: the request goes to ADAPTY_API_URL, ${row.warning === undefined ? 'no warning' : 'warned as before'}`, async () => {
            await writeSession({ ...EU_FILE, region: row.region });
            process.env.ADAPTY_API_URL = row.apiUrl;

            const { error, stderr } = await runCommand(row.command);

            expect(error, `${row.id}: command failed`).to.equal(undefined);
            expect(allOn(fetchStub, row.apiUrl), `${row.id}: requests went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);

            if (row.warning === undefined) {
                expect(stderr, `${row.id}: warning`).to.not.contain('non-default');
            } else {
                expect(stderr.split('\n'), `${row.id}: warning`).to.include(row.warning);
            }
        });
    }

    it('tc_63is7por: a session file of an older CLI works as a US session with its token', async () => {
        await writeSession({ access_token: 'old-token', user: { name: 'Dev' } });

        const { error } = await runCommand(SHARED);

        expect(error).to.equal(undefined);
        expect(allOn(fetchStub, US_HOST), `requests went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);
        expect(bearerOf(fetchStub, 0)).to.equal('Bearer old-token');
    });

    // tc_jtg07xt5: a damaged file stops the command when the region has to come from it
    const damaged: { command: string; envToken: boolean; id: string; unreadable: boolean }[] = [
        { command: SHARED, envToken: false, id: 'shared-truncated', unreadable: false },
        { command: SHARED, envToken: true, id: 'shared-truncated-env-token', unreadable: false },
        { command: SHARED, envToken: true, id: 'shared-unreadable-env-token', unreadable: true },
        { command: OLD, envToken: false, id: 'old-truncated', unreadable: false },
        { command: OLD, envToken: true, id: 'old-truncated-env-token', unreadable: false },
        { command: OLD, envToken: true, id: 'old-unreadable-env-token', unreadable: true },
    ];

    for (const row of damaged) {
        it(`tc_jtg07xt5 ${row.id}: exit 3 with the damaged file text, no region words, no request`, async () => {
            const path = row.unreadable ? await writeUnreadableSession() : await writeTruncatedSession();

            if (row.envToken) {
                process.env.ADAPTY_TOKEN = 'env-token';
            }

            const { error } = await runCommand(row.command);

            expect(error?.oclif?.exit, `${row.id}: exit code`).to.equal(3);

            expect(error?.message.split('\n'), `${row.id}: error text`).to.deep.equal([
                `Session file is corrupted: ${path}`,
                'Delete the file and run `adapty auth login` again.',
            ]);

            expect(error?.message, `${row.id}: region words`).to.not.match(REGION_WORDS);
            expect(fetchStub.callCount, `${row.id}: requests sent`).to.equal(0);
        });
    }

    // tc_4vi9wr0y: with ADAPTY_REGION the damaged file is not needed for a command with an env token
    for (const [id, command] of [['shared', SHARED], ['old', OLD]] as const) {
        it(`tc_4vi9wr0y ${id}: the request goes to EU with the env token, no file error`, async () => {
            await writeTruncatedSession();
            setEnv({ ADAPTY_REGION: 'eu', ADAPTY_TOKEN: 'env-token' });

            const { error } = await runCommand(command);

            expect(error, `${id}: command failed`).to.equal(undefined);
            expect(allOn(fetchStub, EU_HOST), `${id}: requests went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);
            expect(bearerOf(fetchStub, 0), `${id}: token`).to.equal('Bearer env-token');
        });
    }
});
