import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { mockFetch, mockFetchFailure, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

import type { AbMetricsNode } from '../../src/sdk/adapty/index.js';
import type * as sinon from 'sinon';

const TEST_ID = '9b8419eb-d897-42e0-be22-11bf7d57d413';
const OTHER_TEST_ID = '67bff005-5765-4fb7-9106-feeae647b5ae';
const PAYWALL_A = '693c940f-8832-42ac-a901-eba197f156c5';
const PAYWALL_B = '14e62062-e3fa-4c93-b405-93966bb3d9de';
const VARIATION = '1d2bd30a-3434-4342-ae54-4a0202388b65';
const PRODUCT = '03a8e152-e7fd-4467-a11c-2470d656f0e8';
const FLOW_A = '4ee85d42-ff8b-4a06-a9ef-0d6ecb278f5b';
const PATH = `/api/v1/developer/apps/${TEST_APP_ID}/ab-tests`;
const GET = `ab-tests metrics get ${TEST_ID} --app ${TEST_APP_ID} --type paywall`;
const FLOW_GET = `ab-tests metrics get ${TEST_ID} --app ${TEST_APP_ID} --type flow`;
const WINDOW = '--date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date';

const node = (fields: AbMetricsNode & { ab_test_id?: string }) => ({ purchases: 0, revenue: 0, views: 0, ...fields });

/** What the list route answers: the test row, then its arms; no titles. */
const LIST = {
    data: [
        node({
            ab_test_id: TEST_ID,
            average_per_1000: 626.5,
            items: [
                node({ paywall_id: PAYWALL_A, probability: 65.85, purchases: 65, revenue: 649.35, weight: 80 }),
                node({ paywall_id: PAYWALL_B, probability: 34.15, purchases: 61, revenue: 603.72, weight: 20 }),
            ],
            purchases: 126,
            revenue: 1253.07,
            views: 4000,
        }),
        node({
            ab_test_id: OTHER_TEST_ID,
            items: [node({ flow_id: FLOW_A, probability: 100, revenue: 7924.72 })],
            purchases: 266,
            revenue: 7924.72,
            views: 4179,
        }),
    ],
};

const arm = (index: number): AbMetricsNode => node({
    average_per_1000: 10,
    low_boundary: 0,
    paywall: { paywall_id: String(index), title: `Arm ${String(index).padStart(3, '0')}` },
    probability: 1,
    revenue: index,
    unique_paid_subscribers: 3,
    upper_boundary: 20,
    views: 5,
    weight: 1,
});

const DETAIL = {
    data: {
        ab_test: { ab_test_id: TEST_ID, title: 'Pricing test' },
        metrics: Array.from({ length: 100 }, (_, index) => arm(index + 1)),
        started_at: '2026-07-09T15:01:24.547951Z',
        state: 'completed',
    },
};

const TOTAL = {
    data: {
        ab_test: { ab_test_id: TEST_ID, title: 'Pricing test' },
        metrics: [
            node({ average_per_1000: 24193, low_boundary: 0, p_value: 0.124, probability: 94.5, revenue: 241.93, title: 'Variant A', unique_paid_subscribers: 4, upper_boundary: 48386, views: 10, weight: 50 }),
            node({ average_per_1000: 2497.5, low_boundary: 0, p_value: 0.124, probability: 5.5, revenue: 9.99, title: 'Variant B', unique_paid_subscribers: 1, upper_boundary: 4995, views: 4, weight: 50 }),
        ],
        started_at: '2026-10-12T09:26:32.330093Z',
        state: 'live',
        stopped_at: null,
    },
};

describe('ab-tests metrics', () => {
    let fetchStub: sinon.SinonStub | undefined;

    const sent = (index = 0): { body: unknown; headers: Headers; method: string; url: URL } => {
        const [url, init] = fetchStub?.getCall(index).args as [string, RequestInit];

        return {
            body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
            headers: new Headers(init.headers),
            method: init.method ?? 'GET',
            url: new URL(url),
        };
    };

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        if (fetchStub !== undefined) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }
    });

    it('list asks one GET with the ids and the type, and prints a Total line from each test row, never a sum of the arms', async () => {
        fetchStub = mockFetch([LIST]);

        const { stdout } = await runCommand(`ab-tests metrics list --app ${TEST_APP_ID} --type paywall --ids ${TEST_ID},${OTHER_TEST_ID}`);
        const call = sent();
        const lines = stdout.trimEnd().split('\n');

        expect(call.method).to.equal('GET');
        expect(call.url.pathname).to.equal(`${PATH}/metrics/`);
        expect(call.url.searchParams.get('filter[ab_test_id]')).to.equal(`${TEST_ID},${OTHER_TEST_ID}`);
        expect(call.url.searchParams.get('type')).to.equal('paywall');
        expect(lines[1]).to.match(new RegExp(`^${TEST_ID} {2}Total +— +1253\\.07 `));
        expect(lines[2]).to.match(new RegExp(`^ {2}${PAYWALL_A} +80 +649\\.35 +65 +0 +65\\.85 `));
        expect(lines[3]).to.match(new RegExp(`^ {2}${PAYWALL_B} +20 `));
        expect(lines.filter(line => line.includes('Total'))).to.have.length(2);
    });

    it('list --csv has a row for each test and each arm, and --json prints the answer unchanged', async () => {
        fetchStub = mockFetch([LIST]);

        const csv = await runCommand(`ab-tests metrics list --app ${TEST_APP_ID} --type paywall --ids ${TEST_ID} --csv`);
        const rows = csv.stdout.trimEnd().split('\n');

        expect(rows[0]?.startsWith('ab_test_id,level,arm,')).to.equal(true);
        expect(rows).to.have.length(1 + 3 + 2);
        expect(rows[1]?.startsWith(`${TEST_ID},test,"",`)).to.equal(true);
        expect(rows[2]?.startsWith(`${TEST_ID},arm,${PAYWALL_A},`)).to.equal(true);

        const json = await runCommand(`ab-tests metrics list --app ${TEST_APP_ID} --type paywall --ids ${TEST_ID} --json`);

        expect(JSON.parse(json.stdout)).to.deep.equal(LIST);
    });

    it('get sends the window, the type and the time zone header and no based_on; 100 arms are one line each and there is no Total line', async () => {
        fetchStub = mockFetch([DETAIL]);

        const { stdout } = await runCommand(`${GET} ${WINDOW} --granularity day --timezone Asia/Tokyo`);
        const call = sent();
        const lines = stdout.trimEnd().split('\n');

        expect(call.method).to.equal('POST');
        expect(call.url.pathname).to.equal(`${PATH}/${TEST_ID}/metrics/`);
        expect(call.url.searchParams.get('type')).to.equal('paywall');
        expect(call.headers.get('adapty-tz')).to.equal('Asia/Tokyo');

        expect(call.body).to.deep.equal({
            date_type: 'purchase_date',
            filters: { date: ['2026-09-01', '2026-10-21'] },
            period_unit: 'day',
        });

        expect(lines[0]).to.equal('Pricing test  completed  started 2026-07-09');
        expect(lines).to.have.length(1 + 1 + 100 + 1);
        expect(lines[2]).to.match(/^ {2}Arm 001 +/);
        expect(lines.some(line => line.includes('Total'))).to.equal(false);
        expect(lines.at(-1)).to.contain('Fewer than 50 payers');
    });

    it('--csv has the ids of each row, as --json has them: a flow detail has the root row and the variation, flow, screen and product ids', async () => {
        const csvOf = async (answer: unknown, command: string): Promise<Record<string, string>[]> => {
            fetchStub = mockFetch([answer]);

            const { stdout } = await runCommand(`${command} --csv`);

            restoreFetch(fetchStub);
            fetchStub = undefined;

            const [header = '', ...rows] = stdout.trimEnd().split('\n');
            const names = header.split(',');

            return rows.map(row => Object.fromEntries(row.split(',').map((cell, index): [string, string] => [names[index] ?? '', cell])));
        };

        const listCommand = `ab-tests metrics list --app ${TEST_APP_ID} --ids ${TEST_ID} --type`;
        const paywallRows = await csvOf({ data: [node({ ab_test_id: TEST_ID, in_current_state: true, items: [node({ in_current_state: true, paywall_id: PAYWALL_A })] })] }, `${listCommand} paywall`);
        const flowRows = await csvOf({ data: [node({ ab_test_id: TEST_ID, items: [node({ flow_id: FLOW_A, variation_id: VARIATION })] })] }, `${listCommand} flow`);

        expect(paywallRows[0]).to.include({ in_current_state: 'true', level: 'test' });
        expect(paywallRows[1]).to.include({ arm: PAYWALL_A, in_current_state: 'true', paywall_id: PAYWALL_A });
        expect(flowRows[1]).to.include({ arm: VARIATION, flow_id: FLOW_A, variation_id: VARIATION });

        const flowTree = {
            data: {
                items: [{
                    ...arm(1),
                    flow_id: FLOW_A,
                    items: [node({ items: [node({ level: 'product', product_id: PRODUCT, title: 'Weekly' })], level: 'screen', screen_id: 'screen_main', title: 'Welcome' })],
                    level: 'variation',
                    paywall: undefined,
                    title: 'Arm A',
                    variation_id: VARIATION,
                }],
                level: 'root',
                title: 'Flow test',
            },
        };

        const flow = await csvOf(flowTree, FLOW_GET);

        expect(flow.map(row => row.level)).to.deep.equal(['root', 'variation', 'screen', 'product']);
        expect(flow[0]).to.include({ path: 'Flow test', title: 'Flow test' });
        expect(flow[1]).to.include({ flow_id: FLOW_A, path: 'Flow test > Arm A', variation_id: VARIATION });
        expect(flow[2]).to.include({ path: 'Flow test > Arm A > Welcome', screen_id: 'screen_main' });
        expect(flow[3]).to.include({ product_id: PRODUCT });

        const paywall = await csvOf(DETAIL, `${GET} ${WINDOW}`);

        expect(paywall).to.have.length(100);
        expect(paywall[0]).to.include({ level: 'arm', path: 'Arm 001' });
    });

    it('get prints the period points right under an arm, and the children of an arm only with --depth 2', async () => {
        const flowArm = {
            ...arm(1),
            items: [node({ level: 'screen', revenue: 3, title: 'Welcome' })],
            values: [node({ period: '2026-09-01T00:00:00Z', revenue: 2 })],
        };

        fetchStub = mockFetch([{ data: { items: [flowArm], title: 'Flow test' } }]);

        const shallow = (await runCommand(FLOW_GET)).stdout.split('\n');
        const deep = (await runCommand(`${FLOW_GET} --depth 2`)).stdout.split('\n');

        expect(shallow[3]).to.match(/^ {4}2026-09-01 +/);
        expect(shallow.some(line => line.includes('Welcome'))).to.equal(false);
        expect(deep[4]).to.match(/^ {4}Welcome +/);
        expect(deep.at(-2)).to.contain('Fewer than 50 payers');
    });

    it('--csv has the same header for a paywall test and a flow test, on list and on get', async () => {
        const flowArm = node({ flow_id: FLOW_A, p_value: 0.1 });
        const flowRow = { data: [node({ ab_test_id: OTHER_TEST_ID, items: [flowArm] })] };
        const flowDetail = { data: { items: [{ ...arm(1), level: 'variation', p_value: 0.1 }], title: 'Flow test' } };
        const list = `ab-tests metrics list --app ${TEST_APP_ID} --ids ${TEST_ID} --csv --type`;
        const get = `ab-tests metrics get ${TEST_ID} --app ${TEST_APP_ID} --csv --type`;

        const header = async (answer: unknown, command: string): Promise<string | undefined> => {
            fetchStub = mockFetch([answer]);

            const { stdout } = await runCommand(command);

            restoreFetch(fetchStub);
            fetchStub = undefined;

            return stdout.split('\n')[0];
        };

        expect(await header(LIST, `${list} paywall`)).to.equal(await header(flowRow, `${list} flow`));
        expect(await header(DETAIL, `${get} paywall`)).to.equal(await header(flowDetail, `${get} flow`));
    });

    it('total prints the arms with the P2BB, the range and the p-value, and no Total line', async () => {
        fetchStub = mockFetch([TOTAL]);

        const { stdout } = await runCommand(`ab-tests metrics total ${TEST_ID} --app ${TEST_APP_ID} --type flow`);
        const lines = stdout.trimEnd().split('\n');

        expect(sent().method).to.equal('GET');
        expect(sent().url.pathname).to.equal(`${PATH}/${TEST_ID}/metrics/total/`);
        expect(lines[0]).to.equal('Pricing test  live  started 2026-10-12');
        expect(lines[2]).to.match(/^ {2}Variant A +50 +241\.93 +0 +10 +94\.50 +0\.00 \/ 24193\.00 \/ 48386\.00 +0\.124$/);
        expect(stdout).to.not.contain('Total');
        expect(lines.at(-1)).to.contain('0 / mean / 2 × mean');
    });

    it('values asks the filter values of the test with the type', async () => {
        fetchStub = mockFetch([{ data: [{ children: [{ label: 'App Store', value: 'app_store' }], label: 'Store', value: 'store' }], meta: null }]);

        const { stdout } = await runCommand(`ab-tests metrics values ${TEST_ID} --app ${TEST_APP_ID} --type flow`);

        expect(sent().url.pathname).to.equal(`${PATH}/${TEST_ID}/metrics/values/`);
        expect(sent().url.searchParams.get('type')).to.equal('flow');
        expect(stdout).to.contain('Store (store)');
    });

    it('exits 2 before any request, and without a token, for a missing type and an id that is not a UUID', async () => {
        fetchStub = mockFetch([DETAIL]);
        delete process.env.ADAPTY_TOKEN;

        const cases: [string, string][] = [
            [`ab-tests metrics get ${TEST_ID} --app ${TEST_APP_ID}`, 'Missing required flag type'],
            [`ab-tests metrics get nope --app ${TEST_APP_ID} --type paywall`, 'Invalid A/B test ID'],
            [`ab-tests metrics list --app ${TEST_APP_ID} --type paywall --ids nope`, 'Invalid A/B test ID'],
        ];

        for (const [command, text] of cases) {
            const { error } = await runCommand(command);

            expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
            expect(error?.message, command).to.contain(text);
        }

        expect(fetchStub.callCount).to.equal(0);
    });

    it('exits 3 without a token, and exits 4 with the text of the server for a type that does not match', async () => {
        fetchStub = mockFetch([DETAIL]);
        delete process.env.ADAPTY_TOKEN;

        const noToken = await runCommand(`${GET} ${WINDOW}`);

        expect(noToken.error?.oclif?.exit).to.equal(exitCode.auth);
        restoreFetch(fetchStub);

        process.env.ADAPTY_TOKEN = 'test-token';

        fetchStub = mockFetchFailure(
            { error_code: 'ab_test_type_mismatch', errors: { type: ['The A/B test has the type flow, not paywall.'] }, status_code: 400 },
            { status: 400 },
        );

        const { error } = await runCommand(`ab-tests metrics total ${TEST_ID} --app ${TEST_APP_ID} --type paywall`);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error?.message).to.contain('not paywall');
    });
});
