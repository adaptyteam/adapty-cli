import { join } from 'node:path';

import { run } from '@oclif/core';
import { captureOutput } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { mockFetch, mockFetchSteps, requestOf, restoreFetch, TEST_APP_ID, TEST_RESOURCE_ID } from '../helpers/mock-fetch.js';

import type * as sinon from 'sinon';

const ROOT = join(import.meta.dirname, '..', '..');
const APP = `--app ${TEST_APP_ID}`;
const BASE = `/apps/${TEST_APP_ID}/refund-saver`;
const PROFILE = TEST_RESOURCE_ID;

const runCommand = (line: string) => captureOutput(async () => run(line.split(' '), { root: ROOT }));

/** Under --json oclif prints the error object and sets the exit code instead of throwing. */
type JsonRun = { exit: null | number | string | undefined; stdout: unknown };

const runJson = async (line: string): Promise<JsonRun> => {
    process.exitCode = undefined;

    const { stdout } = await runCommand(`${line} --json`);
    const exit = process.exitCode;

    process.exitCode = undefined;

    return { exit, stdout: JSON.parse(stdout) as unknown };
};

const STORES = {
    app_store: { preference: 'decline_first_grant_next', refund_saver_needs_consent: false },
    play_store: { preference: 'always_refund' },
};

const state = (enabled: boolean, note: null | string) =>
    ({ billing_note: note, enabled, stores: STORES });

const SERVER_NOTE = 'A note from the server.';

const INACTIVE = 'The Refund Saver add-on is not active.';

const refusal = {
    errors: { non_field_errors: [INACTIVE] },
    error_code: 'refund_saver_addon_inactive',
    status_code: 409,
};

/** The path and query of a request, without the API base: what a row compares. */
const sent = (stub: sinon.SinonStub) => {
    const request = requestOf(stub, 0);
    const url = new URL(request.url);

    return {
        body: request.body === undefined ? undefined : JSON.parse(request.body) as unknown,
        method: request.method,
        path: url.pathname.replace('/api/v1/developer', ''),
        query: Object.fromEntries([...url.searchParams].sort(([a], [b]) => a.localeCompare(b))),
    };
};

describe('refund-saver', () => {
    let fetchStub: sinon.SinonStub | undefined;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = undefined;
    });

    afterEach(() => {
        if (fetchStub) {
            restoreFetch(fetchStub);
        }

        delete process.env.ADAPTY_TOKEN;
    });

    // external: the request each command sends is the Developer API contract
    it('each command sends its route, query and body', async () => {
        const period = '--date-from 2026-10-01 --date-to 2026-10-31';
        const page = { data: [], meta: { pagination: { count: 0, page: 1, pages: 1 } } };

        const rows = [
            { answer: state(true, null), line: `refund-saver get ${APP}`, method: 'GET', path: `${BASE}/` },
            { answer: state(true, null), line: `refund-saver on ${APP}`, method: 'POST', path: `${BASE}/enable/` },
            { answer: state(false, null), line: `refund-saver off ${APP}`, method: 'POST', path: `${BASE}/disable/` },
            {
                answer: { stores: STORES },
                body: { stores: { app_store: { preference: 'always_decline', refund_saver_needs_consent: false } } },
                line: `refund-saver update ${APP} --app-store-preference always_decline --no-needs-consent`,
                method: 'PATCH',
                path: `${BASE}/preferences/`,
            },
            {
                answer: { stores: STORES },
                body: { stores: { play_store: { preference: 'always_refund' } } },
                line: `refund-saver update ${APP} --play-store-preference always_refund`,
                method: 'PATCH',
                path: `${BASE}/preferences/`,
            },
            { answer: { app_store: true, play_store: true }, line: `refund-saver readiness ${APP}`, method: 'GET', path: `${BASE}/readiness/` },
            {
                answer: { consent: null, custom_preference: null },
                line: `refund-saver profile get ${APP} ${PROFILE}`,
                method: 'GET',
                path: `${BASE}/profiles/${PROFILE}/`,
            },
            {
                answer: { consent: true, custom_preference: null },
                body: { consent: true },
                line: `refund-saver profile update ${APP} ${PROFILE} --consent`,
                method: 'POST',
                path: `${BASE}/profiles/${PROFILE}/`,
            },
            {
                answer: page,
                line: `refund-saver requests ${APP} ${period} --store app_store --page 2 --page-size 5`,
                method: 'GET',
                path: `${BASE}/transactions/`,
                query: { 'date_from': '2026-10-01', 'date_to': '2026-10-31', 'page[number]': '2', 'page[size]': '5', 'store': 'app_store' },
            },
            {
                answer: page,
                line: `refund-saver requests ${APP} ${period}`,
                method: 'GET',
                path: `${BASE}/transactions/`,
                query: { 'date_from': '2026-10-01', 'date_to': '2026-10-31', 'page[number]': '1', 'page[size]': '20' },
            },
            {
                answer: { requested_amount_usd: 0, requested_count: 0, saved_amount_usd: 0, saved_count: 0, win_rate: '0.0' },
                line: `refund-saver metrics ${APP} ${period}`,
                method: 'GET',
                path: `${BASE}/metrics/`,
                query: { date_from: '2026-10-01', date_to: '2026-10-31' },
            },
        ];

        const failures: string[] = [];

        for (const row of rows) {
            fetchStub = mockFetch([row.answer]);
            const { error } = await runCommand(row.line);
            const actual = error ? undefined : sent(fetchStub);
            const expected = { body: row.body, method: row.method, path: row.path, query: row.query ?? {} };

            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                failures.push(`${row.line}: sent ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
            }

            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        expect(failures).to.deep.equal([]);
    });

    // external: a usage error is exit 2 and nothing is sent
    it('update and profile update with no setting are usage errors with no request', async () => {
        const failures: string[] = [];

        for (const line of [`refund-saver update ${APP}`, `refund-saver profile update ${APP} ${PROFILE}`]) {
            fetchStub = mockFetch();
            const { error } = await runCommand(line);

            if (error?.oclif?.exit !== exitCode.usage || fetchStub.callCount !== 0) {
                failures.push(`${line}: exit ${String(error?.oclif?.exit)}, ${fetchStub.callCount} request(s)`);
            }

            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        expect(failures).to.deep.equal([]);
    });

    // external: a 409 refusal of on is an API error (exit 4) with the text of the server
    it('on refused with 409 exits 4 with the refusal text, and with its code under --json', async () => {
        fetchStub = mockFetchSteps([{ body: refusal, status: 409 }]);

        const { error } = await runCommand(`refund-saver on ${APP}`);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error?.message).to.contain(INACTIVE);

        const json = await runJson(`refund-saver on ${APP}`);

        expect(json.exit).to.equal(exitCode.api);
        expect(json.stdout).to.have.nested.property('error.code', 'refund_saver_addon_inactive');
        expect(json.stdout).to.have.nested.property('error.message', INACTIVE);
    });

    // external: the server note in both outputs; no note line when the server sends none
    it('on prints the server note, and keeps it in --json', async () => {
        fetchStub = mockFetch([state(true, SERVER_NOTE)]);

        const { stdout } = await runCommand(`refund-saver on ${APP}`);
        const json = await runJson(`refund-saver on ${APP}`);

        expect(stdout).to.contain('Refund Saver: on').and.to.contain(`Note: ${SERVER_NOTE}`);
        expect(json.stdout).to.deep.equal(state(true, SERVER_NOTE));

        restoreFetch(fetchStub);
        fetchStub = mockFetch([state(true, null)]);

        expect((await runCommand(`refund-saver on ${APP}`)).stdout).to.not.contain('Note:');
    });

    // external: off prints the turn-off note after the state
    it('off prints the state and the turn-off note', async () => {
        fetchStub = mockFetch([state(false, null)]);

        const { stdout } = await runCommand(`refund-saver off ${APP}`);

        expect(stdout).to.contain('Refund Saver: off');
        expect(stdout).to.contain('Turning Refund Saver off does not cancel the Refund Saver add-on');
    });

    // external: a store that is not ready names the setup it misses
    it('readiness prints one line for each store, with the missing setup', async () => {
        fetchStub = mockFetch([{ app_store: false, play_store: true }]);

        const { stdout } = await runCommand(`refund-saver readiness ${APP}`);

        expect(stdout.trim().split('\n')).to.deep.equal([
            'App Store: not ready: set the bundle ID and the App Store Connect API key ID, issuer ID and private key in App settings',
            'Play Store: ready',
        ]);
    });

    // external: a profile with no settings prints both, not an empty block
    it('profile get prints both settings, with — for one that is not set', async () => {
        fetchStub = mockFetch([{ consent: null, custom_preference: 'decline' }]);

        const { stdout } = await runCommand(`refund-saver profile get ${APP} ${PROFILE}`);

        expect(stdout.trim().split('\n')).to.deep.equal(['Custom Preference: decline', 'Consent: —']);
    });

    // external: amounts are whole USD and the win rate a percent as text
    it('metrics prints the amounts in USD and the win rate in percent', async () => {
        fetchStub = mockFetch([{
            requested_amount_usd: 16, requested_count: 5, saved_amount_usd: 10, saved_count: 3, win_rate: '62.5',
        }]);

        const { stdout } = await runCommand(`refund-saver metrics ${APP} --date-from 2026-10-01 --date-to 2026-10-31`);

        expect(stdout.trim().split('\n')).to.deep.equal([
            'Saved Amount: 10 USD',
            'Saved Count: 3',
            'Requested Amount: 16 USD',
            'Requested Count: 5',
            'Win Rate: 62.5%',
        ]);
    });
});
