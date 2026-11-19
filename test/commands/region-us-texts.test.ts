import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { EMPTY_LIST_RESPONSE, mockFetch, mockFetchFailure, TEST_APP_ID } from '../helpers/mock-fetch.js';
import { REGION_WORDS, writeSession } from '../helpers/region.js';

const ROOT = join(import.meta.dirname, '..', '..');

const US_FILE = { access_token: 'file-token', region: 'us', user: { name: 'Dev' } };

const deviceBody = {
    device_code: 'd',
    expires_in: 300,
    interval: 0,
    user_code: 'WDJB-MJHT',
    verification_uri: 'https://app.adapty.io/cli-auth',
    verification_uri_complete: 'https://app.adapty.io/cli-auth?code=WDJB-MJHT',
};

const expired = { error_code: 'token_invalid' };

/** What a person reads, and what it must look like for a US account; `text` is everything it printed. */
type Row = { id: string; read: () => Promise<string> };

const printed = async (command: string): Promise<string> => {
    const { error, stderr, stdout } = await runCommand(command);

    return [stdout, stderr, error?.message ?? ''].join('\n');
};

/**
 * Admission: external. A person with a US account reads the help, the README and the output, and
 * the region stays out of all of them: `--region` is hidden and only the agent docs name it.
 */
describe('a US account sees no region', () => {
    afterEach(() => {
        sinon.restore();
    });

    // tc_diy7qdlk
    const rows: Row[] = [
        { id: 'help', read: async () => printed('--help') },
        { id: 'login-help', read: async () => printed('auth login --help') },
        { id: 'readme', read: async () => readFile(join(ROOT, 'README.md'), 'utf8') },
        {
            id: 'us-login',
            async read() {
                await writeSession(US_FILE);
                // A code that expires at once: the output up to the link, without the wait of the poll
                mockFetch([{ ...deviceBody, expires_in: 0 }]);

                return printed('auth login');
            },
        },
        {
            id: 'us-command',
            async read() {
                await writeSession(US_FILE);
                mockFetch([EMPTY_LIST_RESPONSE]);

                return printed('apps list');
            },
        },
        {
            id: 'expired-shared',
            async read() {
                await writeSession(US_FILE);
                mockFetchFailure(expired, { status: 401 });

                return printed('apps list');
            },
        },
        {
            id: 'expired-old',
            async read() {
                await writeSession(US_FILE);
                mockFetchFailure(expired, { status: 401 });

                return printed(`access-levels list --app ${TEST_APP_ID}`);
            },
        },
    ];

    for (const row of rows) {
        it(`tc_diy7qdlk ${row.id}: no region words`, async () => {
            const text = await row.read();

            expect(text.trim(), `${row.id}: nothing was read`).to.not.equal('');
            expect(text, `${row.id}: region words`).to.not.match(REGION_WORDS);
        });
    }
});
