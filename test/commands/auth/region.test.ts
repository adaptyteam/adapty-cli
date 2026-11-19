import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { createMigrationContext } from '../../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../../src/cli/context/migration/store.js';
import { mockFetch, requestOf, restoreFetch } from '../../helpers/mock-fetch.js';
import { allOn, EU_HOST, sessionPath, urlsOf, US_HOST, writeSession } from '../../helpers/region.js';

import type { MigrationContextStore } from '../../../src/cli/context/migration/store.js';
import type * as sinon from 'sinon';

const ROOT = join(import.meta.dirname, '..', '..', '..');

const fileOf = (token: string, region: string | undefined): Record<string, unknown> => ({
    access_token: token,
    user: { name: 'Dev' },
    ...(region === undefined ? {} : { region }),
});

type Env = Partial<Record<'ADAPTY_REGION' | 'ADAPTY_TOKEN', string>>;

const setEnv = (env: Env): void => {
    for (const [key, value] of Object.entries(env)) {
        process.env[key] = value;
    }
};

const readRaw = async (): Promise<string | undefined> => {
    try {
        return await readFile(await sessionPath(), 'utf8');
    } catch {
        return undefined;
    }
};

/**
 * Admission: external. What `auth status` prints and returns is read by agents and scripts; logout
 * and revoke decide which token dies on which service and which local files survive.
 */
describe('auth commands and the region', () => {
    let context: MigrationContextStore;
    let fetchStub: sinon.SinonStub;

    beforeEach(async () => {
        context = createMigrationContextStore((await Config.load(ROOT)).configDir);
        fetchStub = mockFetch([{}]);
    });

    afterEach(() => {
        restoreFetch(fetchStub);
    });

    // tc_3pt2gz9a: the region of a saved EU session, in the text and in the JSON; nothing else changes
    const statuses: { env: Env; eu: boolean; file?: Record<string, unknown>; id: string }[] = [
        { env: {}, eu: true, file: fileOf('file-token', 'eu'), id: 'eu-session' },
        { env: { ADAPTY_REGION: 'us' }, eu: true, file: fileOf('file-token', 'eu'), id: 'eu-session-env-us' },
        { env: { ADAPTY_TOKEN: 'env-token' }, eu: true, file: fileOf('file-token', 'eu'), id: 'eu-session-env-token' },
        {
            env: { ADAPTY_REGION: 'us', ADAPTY_TOKEN: 'env-token' },
            eu: true,
            file: fileOf('file-token', 'eu'),
            id: 'eu-session-env-token-env-us',
        },
        { env: { ADAPTY_REGION: 'eu' }, eu: false, file: fileOf('file-token', 'us'), id: 'us-session-env-eu' },
        { env: {}, eu: false, file: fileOf('file-token', undefined), id: 'old-file' },
        { env: {}, eu: false, id: 'no-file' },
    ];

    for (const row of statuses) {
        it(`tc_3pt2gz9a ${row.id}: ${row.eu ? 'shows Region: eu' : 'shows no region'} in text and JSON`, async () => {
            if (row.file !== undefined) {
                await writeSession(row.file);
            }

            setEnv(row.env);

            const text = await runCommand('auth status');
            const json = JSON.parse((await runCommand('auth status --json')).stdout) as Record<string, unknown>;

            if (row.eu) {
                expect(text.stdout.split('\n'), `${row.id}: text`).to.include('Region: eu');
                expect(json.region, `${row.id}: JSON`).to.equal('eu');
            } else {
                expect(text.stdout, `${row.id}: text`).to.not.contain('Region');
                expect(json, `${row.id}: JSON`).to.not.have.property('region');
            }

            expect(fetchStub.callCount, `${row.id}: requests sent`).to.equal(0);
        });
    }

    it('tc_j51mw1av: logout removes the EU session and the migration, sends nothing; the next login goes to US', async () => {
        await writeSession(fileOf('file-token', 'eu'));
        await context.save(createMigrationContext({ token: 'file-token' }, 'mig_saved'));

        const { error } = await runCommand('auth logout');

        expect(error).to.equal(undefined);
        expect(await readRaw(), 'session file').to.equal(undefined);
        expect(await context.load(), 'migration').to.equal(undefined);
        expect(fetchStub.callCount, 'requests sent by logout').to.equal(0);

        restoreFetch(fetchStub);

        fetchStub = mockFetch([
            { device_code: 'd', expires_in: 0, interval: 0, user_code: 'U', verification_uri: 'https://app.adapty.io/cli-auth' },
        ]);

        await runCommand('auth login');

        expect(allOn(fetchStub, US_HOST), `next login went to ${urlsOf(fetchStub).join(', ')}`).to.equal(true);
    });

    // tc_5lzv9izw: revoke sends the effective token to the host of the region of the command
    const revoked: { env: Env; file?: Record<string, unknown>; id: string; token: string }[] = [
        { env: {}, file: fileOf('token-a', 'eu'), id: 'eu-session', token: 'token-a' },
        { env: { ADAPTY_REGION: 'eu', ADAPTY_TOKEN: 'token-b' }, id: 'env-token-env-eu-no-file', token: 'token-b' },
        { env: { ADAPTY_TOKEN: 'token-b' }, file: fileOf('token-a', 'eu'), id: 'env-token-saved-eu', token: 'token-b' },
    ];

    for (const row of revoked) {
        it(`tc_5lzv9izw ${row.id}: one revoke of token ${row.token} on the EU host`, async () => {
            if (row.file !== undefined) {
                await writeSession(row.file);
            }

            setEnv(row.env);

            const { error } = await runCommand('auth revoke');

            expect(error, `${row.id}: revoke failed`).to.equal(undefined);
            expect(urlsOf(fetchStub), `${row.id}: requests`).to.deep.equal([`${EU_HOST}/auth/tokens/revoke/`]);
            expect(JSON.parse(requestOf(fetchStub, 0).body ?? '{}'), `${row.id}: revoked token`).to.deep.equal({ token: row.token });
        });
    }
});
