import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import { mockFetch, mockFetchFailure, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

const BASE = 'https://api-admin.adapty.io/api/v1/developer';
const FLOW_ID = '0b0c7e9e-3c06-4f7a-9d7e-2f2f6d3c1b11';
const VERSION_ID = '9bcfffcb-46b3-4b67-839a-bc3d00f285b5';

const screen = (fields: Record<string, unknown>) => ({
    completed: 0,
    completed_share_of_step: null,
    completion_rate: null,
    drop_off: 0,
    drop_off_rate: null,
    drop_off_share_of_step: null,
    is_last_screen: false,
    paywall_ids: [],
    purchases: null,
    reached: 0,
    revenue: null,
    screen_type: 'onboarding',
    share_of_step: null,
    trials: null,
    ...fields,
});

// One step with one screen, one step with two screens, a paywall step: the three forms a row can take
const FUNNEL = {
    data: {
        flow_id: FLOW_ID,
        flow_version_id: VERSION_ID,
        steps: [
            {
                completed: 0,
                completion_rate: 0,
                conversion_from_previous: null,
                drop_off: 2,
                drop_off_rate: 16.67,
                has_paywall: false,
                purchases: null,
                reached: 12,
                reached_rate: 100,
                revenue: null,
                screens: [screen({ drop_off: 2, reached: 12, screen_id: 'welcome', title: 'Welcome' })],
                step_order: 1,
                trials: null,
            },
            {
                completed: 0,
                completion_rate: 0,
                conversion_from_previous: 83.33,
                drop_off: 1,
                drop_off_rate: 10,
                has_paywall: false,
                purchases: null,
                reached: 10,
                reached_rate: 83.33,
                revenue: null,
                screens: [
                    screen({ reached: 6, screen_id: 'plan_a', title: 'Plan A' }),
                    screen({ drop_off: 1, reached: 4, screen_id: 'plan_b', title: 'Plan B' }),
                ],
                step_order: 2,
                trials: null,
            },
            {
                completed: 3,
                completion_rate: 30,
                conversion_from_previous: 90,
                drop_off: null,
                drop_off_rate: null,
                has_paywall: true,
                purchases: 3,
                reached: 9,
                reached_rate: 75,
                revenue: 2.97,
                screens: [screen({
                    completed: 3,
                    drop_off: null,
                    is_last_screen: true,
                    paywall_ids: ['p1'],
                    purchases: 3,
                    reached: 9,
                    revenue: 2.97,
                    screen_id: 'paywall',
                    screen_type: 'paywall',
                    title: 'Paywall',
                    trials: 0,
                })],
                step_order: 3,
                trials: 0,
            },
        ],
        summary: { completed: 8, completion_rate: 66.67, drop_rate: 33.33, dropped: 4, entered: 12, revenue: 2.97 },
        version: 3,
        version_screens: [],
    },
    meta: null,
};

const EMPTY_FUNNEL = {
    data: {
        flow_id: FLOW_ID,
        flow_version_id: VERSION_ID,
        steps: [],
        summary: { completed: 0, completion_rate: null, drop_rate: null, dropped: 0, entered: 0, revenue: null },
        version: 1,
        version_screens: [
            { paywall_ids: [], screen_id: 'welcome', screen_type: 'onboarding', title: 'Welcome' },
            { paywall_ids: ['p1'], screen_id: 'paywall', screen_type: 'paywall', title: 'Paywall' },
        ],
    },
    meta: null,
};

const VALUES = {
    data: [{ children: [{ label: 'iOS', value: 'iOS' }, { label: 'Android', value: 'Android' }], label: 'Platform', value: 'platform' }],
    meta: null,
};

// The file the dashboard downloads: a text, not JSON
const CSV = 'level,step_order,title,reached\ntotal,-,Total,12\nstep,1,Welcome,12\n';

type Call = { body: unknown; headers: Headers; method: string; url: URL };

const callOf = (stub: sinon.SinonStub, index = 0): Call => {
    const [url, init] = stub.getCall(index).args as [string, RequestInit];

    return {
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        headers: new Headers(init.headers),
        method: init.method ?? 'GET',
        url: new URL(url),
    };
};

describe('flows funnel', () => {
    let fetchStub: sinon.SinonStub | undefined;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        if (fetchStub !== undefined) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }
    });

    const GET_BARE = `flows funnel get ${FLOW_ID} --app ${TEST_APP_ID}`;
    const GET = `${GET_BARE} --date-from 2026-10-29 --date-to 2026-10-29 --date-type purchase_date`;
    const url = (call: Call): string => call.url.origin + call.url.pathname;

    describe('flows funnel get', () => {
        it('sends the period, the date type, the version, the filters and the time zone, and --json prints the answer unchanged', async () => {
            fetchStub = mockFetch([FUNNEL]);

            const { stdout } = await runCommand([
                ...GET_BARE.split(' '),
                '--date-from', '2026-10-01',
                '--date-to', '2026-10-29',
                '--date-type', 'profile_install_date',
                '--flow-version-id', VERSION_ID,
                '--filter', 'platform=iOS,Android',
                '--filter', 'store=app_store',
                '--timezone', 'Europe/Berlin',
                '--json',
            ]);

            expect(JSON.parse(stdout)).to.deep.equal(FUNNEL);

            const call = callOf(fetchStub);

            expect(call.method).to.equal('POST');
            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/flows/${FLOW_ID}/screen-funnel/`);
            expect(call.url.search).to.equal('');
            expect(call.headers.get('adapty-tz')).to.equal('Europe/Berlin');

            expect(call.body).to.deep.equal({
                date_type: 'profile_install_date',
                filters: { date: ['2026-10-01', '2026-10-29'], platform: ['iOS', 'Android'], store: ['app_store'] },
                flow_version_id: VERSION_ID,
            });
        });

        it('sends only what was given: no version, no time zone header', async () => {
            fetchStub = mockFetch([FUNNEL]);

            await runCommand(`${GET} --json`);

            const call = callOf(fetchStub);

            expect(call.body).to.deep.equal({ date_type: 'purchase_date', filters: { date: ['2026-10-29', '2026-10-29'] } });
            expect(call.headers.has('adapty-tz')).to.equal(false);
        });

        it('prints the summary, a row for each step, and the screens under a step that has more than one', async () => {
            fetchStub = mockFetch([FUNNEL]);

            const { stdout } = await runCommand(GET);

            expect(stdout).to.equal([
                'Flow version 3 (published) · 2026-10-29 to 2026-10-29 · purchase date',
                'Entered 12 · Completed 8 (66.67%) · Drop rate 4 (33.33%) · Revenue 2.97',
                '',
                'Step         Type        Reached      Completed  Drop rate   Revenue',
                '1 Welcome    onboarding  12 (100%)    0          2 (16.67%)  —',
                '2 2 screens              10 (83.33%)  0          1 (10%)     —',
                '    Plan A   onboarding  6            0          0           —',
                '    Plan B   onboarding  4            0          1           —',
                '3 Paywall    paywall     9 (75%)      3          —           2.97',
                '',
            ].join('\n'));
        });

        it('names the version when the user asked for one, and prints a rate that does not apply as nothing, never as 0', async () => {
            const summary = { ...FUNNEL.data.summary, completion_rate: null, revenue: null };

            fetchStub = mockFetch([{ ...FUNNEL, data: { ...FUNNEL.data, summary } }]);

            const { stdout } = await runCommand(`${GET} --flow-version-id ${VERSION_ID}`);
            const [header, line] = stdout.split('\n');

            expect(header).to.equal('Flow version 3 · 2026-10-29 to 2026-10-29 · purchase date');
            expect(line).to.equal('Entered 12 · Completed 8 · Drop rate 4 (33.33%) · Revenue —');
        });

        it('with no steps prints the summary and the screens of the version with zeros', async () => {
            fetchStub = mockFetch([EMPTY_FUNNEL]);

            const { stdout } = await runCommand(GET);

            expect(stdout).to.equal([
                'Flow version 1 (published) · 2026-10-29 to 2026-10-29 · purchase date',
                'Entered 0 · Completed 0 · Drop rate 0 · Revenue —',
                '',
                'No users entered this flow in this period. The screens of the version:',
                '',
                'Step     Type        Reached  Completed  Drop rate  Revenue',
                'Welcome  onboarding  0        0          0          —',
                'Paywall  paywall     0        0          0          0.00',
                '',
            ].join('\n'));
        });

        it('--csv asks for the CSV and prints the text of the server unchanged', async () => {
            fetchStub = sinon.stub(globalThis, 'fetch').callsFake(() =>
                Promise.resolve(new Response(CSV, { headers: { 'Content-Type': 'text/csv' }, status: 200 })));

            const { stdout } = await runCommand(`${GET} --timezone Europe/Berlin --csv`);
            const call = callOf(fetchStub);

            expect(stdout).to.equal(CSV);
            expect(call.method).to.equal('POST');
            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/flows/${FLOW_ID}/screen-funnel/`);
            expect(call.url.search).to.equal('?format=csv');
            expect(call.headers.get('accept')).to.equal('text/csv');
            expect(call.headers.get('adapty-tz')).to.equal('Europe/Berlin');
            expect(call.body).to.deep.equal({ date_type: 'purchase_date', filters: { date: ['2026-10-29', '2026-10-29'] } });
        });

        it('exits 2 and sends no request for a missing date type, a missing end of the period, a bad date, a bad version, a bad filter and --csv with --json, without a token', async () => {
            fetchStub = mockFetch([FUNNEL]);
            delete process.env.ADAPTY_TOKEN;

            const cases: [string, string][] = [
                [`${GET_BARE} --date-from 2026-10-29 --date-to 2026-10-29`, 'Missing required flag date-type'],
                [`${GET_BARE} --date-from 2026-10-29 --date-type purchase_date`, 'Missing required flag date-to'],
                [`${GET_BARE} --date-to 2026-10-29 --date-type purchase_date`, 'Missing required flag date-from'],
                [`${GET_BARE} --date-from 2026-9-1 --date-to 2026-10-29 --date-type purchase_date`, 'YYYY-MM-DD'],
                [`${GET} --flow-version-id not-a-uuid`, 'flow version ID'],
                [`${GET} --filter platform`, 'dimension=value'],
                [`flows funnel get not-a-uuid --app ${TEST_APP_ID}`, 'flow ID'],
            ];

            for (const [command, text] of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
                expect(error?.message, command).to.contain(text);
            }

            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stdout } = await runCommand(`${GET} --csv --json`);
            const exit = process.exitCode;

            process.exitCode = 0;

            expect(exit).to.equal(exitCode.usage);
            expect((JSON.parse(stdout) as { error: { message: string } }).error.message).to.contain('--json=true cannot also be provided when using --csv');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 4 with the text of the route for a flow without a published version (400) and for a flow that does not exist (404)', async () => {
            const cases: [number, string][] = [
                [400, 'Flow has no published version. Publish the flow or pass `flow_version_id`.'],
                [404, 'Flow does not exist.'],
            ];

            for (const [status, text] of cases) {
                fetchStub = mockFetchFailure(
                    { error_code: status === 400 ? 'validation_error' : 'not_found', errors: { non_field_errors: [text] }, status_code: status },
                    { status },
                );

                const { error } = await runCommand(GET);

                restoreFetch(fetchStub);
                fetchStub = undefined;

                expect(error?.oclif?.exit, String(status)).to.equal(exitCode.api);
                expect(error?.message, String(status)).to.contain(text);
            }
        });

        it('exits 3 without a token', async () => {
            fetchStub = mockFetch([FUNNEL]);
            delete process.env.ADAPTY_TOKEN;

            const { error } = await runCommand(GET);

            expect(error?.oclif?.exit).to.equal(exitCode.auth);
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('flows funnel values', () => {
        it('reads the filter values of the funnel and prints them as the metrics values are printed', async () => {
            fetchStub = mockFetch([VALUES]);

            const { stdout } = await runCommand(`flows funnel values ${FLOW_ID} --app ${TEST_APP_ID}`);
            const call = callOf(fetchStub);

            expect(call.method).to.equal('GET');
            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/flows/${FLOW_ID}/screen-funnel/values/`);
            expect(stdout).to.equal('Platform (platform)\n  iOS (iOS)\n  Android (Android)\n');
        });

        it('--json prints the answer unchanged', async () => {
            fetchStub = mockFetch([VALUES]);

            const { stdout } = await runCommand(`flows funnel values ${FLOW_ID} --app ${TEST_APP_ID} --json`);

            expect(JSON.parse(stdout)).to.deep.equal(VALUES);
        });
    });
});
