import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import { assertFetch, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

type Step = {
    body: unknown;
    headers?: Record<string, string>;
    status?: number;
};

/** Answers each call with its own status and headers; mockFetch's canned responses are all 200. */
const mockFetchSteps = (steps: Step[]): sinon.SinonStub => {
    let index = 0;

    return sinon.stub(globalThis, 'fetch').callsFake(() => {
        const step = steps[index] ?? steps.at(-1);
        index += 1;

        return Promise.resolve(new Response(JSON.stringify(step?.body), {
            headers: { 'content-type': 'application/json', ...step?.headers },
            status: step?.status ?? 200,
        }));
    });
};

const requestOf = (stub: sinon.SinonStub, callIndex: number) => {
    const [url, init] = stub.getCall(callIndex).args as [string, RequestInit];

    return {
        body: typeof init.body === 'string' ? JSON.parse(init.body) as unknown : undefined,
        headers: new Headers(init.headers),
        method: init.method,
        url,
    };
};

const ANALYTICS = `/apps/${TEST_APP_ID}/analytics`;
const PERIOD = '--date-from 2026-07-01 --date-to 2026-09-30';
const APP = `--app ${TEST_APP_ID}`;

const meta = { query: { timezone: 'UTC', timezone_source: 'app' } };

// Each answer lists a group before the total, so the views must put the total first themselves, and holds a
// 0 and, where the API allows one, a null: the views keep 0 as 0 and never print null as 0.
const chartAnswer = {
    data: {
        compare: {
            segments: [{ is_total: true, key: null, title: 'Total', value: 12, values: [{ value: 12, x: '2026-06-01' }] }],
            value: 12,
        },
        segments: [
            { is_total: false, key: 'US', title: 'United States', value: 30.5, values: [{ value: 30.5, x: '2026-07-01' }, { value: 0, x: '2026-08-01' }] },
            { is_total: true, key: null, title: 'Total', value: 30.5, values: [{ value: 30.5, x: '2026-07-01' }, { value: 0, x: '2026-08-01' }] },
            { is_total: false, key: '', title: 'No Data', value: 0, values: [{ value: 0, x: '2026-07-01' }] },
        ],
        value: 30.5,
    },
    meta,
};

const conversionAnswer = {
    data: {
        compare: null,
        segments: [
            { is_total: false, key: 'US', title: 'United States', value: 0, value_from: 4, value_to: 0, values: [] },
            {
                is_total: true,
                key: null,
                title: 'Conversion rate from trial to paid',
                value: 25,
                value_from: 4,
                value_to: 1,
                values: [{ has_unfinished: false, value: 25, value_from: 4, value_from_unfinished: 0, value_to: 1, x: '2026-07-01' }],
            },
        ],
        value: 25,
        value_from: 4,
        value_to: 1,
    },
    meta: { ...meta, recommended_period: null },
};

const funnelAnswer = {
    data: {
        segments: [
            { is_total: false, key: 'US', title: 'United States', value: null, values: [] },
            {
                is_total: true,
                key: null,
                title: 'Total',
                value: 3,
                values: [
                    { title: 'Install', value: 3, value_relative: 100, x: -2 },
                    { title: 'Paywall displayed', value: 0, value_relative: 0, x: -1 },
                ],
            },
        ],
        value: 3,
    },
    meta,
};

const retentionAnswer = {
    data: {
        segments: [
            { first_value: 0, is_total: false, key: 'US', title: 'United States', value: 0, values: [{ title: 'Paid', value: 0, value_relative: 0, x: 1 }] },
            { first_value: 5, is_total: true, key: null, title: 'Total', value: 5, values: [{ title: 'Paid', value: 5, value_relative: 100, x: 1 }] },
        ],
        value: 5,
    },
    meta,
};

const ltvAnswer = {
    data: {
        segments: [
            { cohort_size: 1, is_total: false, key: 'US', title: 'United States', value: 0, values: [{ value: 0, x: 1 }, { value: null, x: 2 }] },
            { cohort_size: 2, is_total: true, key: null, title: 'Total', value: 1.5, values: [{ value: 1.5, x: 1 }, { value: null, x: 2 }] },
        ],
        value: 1.5,
    },
    meta,
};

const nullPredict = {
    ltv3: null, ltv6: null, ltv9: null, ltv12: null, ltv18: null, ltv24: null,
    rev3: null, rev6: null, rev9: null, rev12: null, rev18: null, rev24: null,
};

const cohortAnswer = {
    data: {
        segments: [
            {
                arpas: 0, arppu: 0, arpu: 0, installs: 0, is_total: false, key: '2026-07-01',
                predict: { ...nullPredict, rev6: 0 },
                subscribers: 0, subscriptions: 0, title: '2026-07-01', value: 0, values: [],
            },
            {
                arpas: 10, arppu: 10, arpu: 3.5, installs: 3, is_total: true, key: null, predict: null,
                subscribers: 1, subscriptions: 1, title: 'Total', value: 10,
                values: [{
                    arpas: 10, arppu: 10, arpu: 3.5, currently_active_period: true, installs: 3, subscribers: 1,
                    subscribers_relative: 100, subscriptions: 1, subscriptions_relative: 100,
                    value: 10, value_relative: 100, x: 1,
                }],
            },
        ],
        value: 10,
    },
    meta,
};

const PREDICT_HEADER = 'predict.rev3,predict.rev6,predict.rev9,predict.rev12,predict.rev18,predict.rev24,'
    + 'predict.ltv3,predict.ltv6,predict.ltv9,predict.ltv12,predict.ltv18,predict.ltv24';

const catalogAnswer = {
    data: {
        charts: [{
            default_segmentation: null,
            filters: ['country', 'store'],
            id: 'revenue',
            segmentations: [{ key: 'country', label: 'Country' }],
            takes_revenue_basis: true,
            title: 'Revenue',
            unit: 'USD',
        }],
        conversions: [{ id: 'trial-paid', title: 'Trial → Paid' }],
        dimensions: [{ key: 'country', label: 'Country' }],
        operations: [
            {
                can_compare: true,
                filters: [],
                id: 'metrics',
                method: 'POST',
                options: [{ default: 'month', name: 'period_unit', values: ['day', 'month'] }],
                path: 'metrics/',
                segmentations: [],
            },
            {
                can_compare: false,
                filters: ['country'],
                id: 'retention',
                method: 'POST',
                options: [{ default: false, name: 'use_trial', values: null }, { default: null, name: 'timezone', values: null }],
                path: 'retention/',
                segmentations: [{ key: 'country', label: 'Country' }],
            },
        ],
    },
};

const valuesAnswer = {
    data: [{ group: 'Europe', label: 'Germany', value: 'DE' }, { group: null, label: 'No Data', value: '' }],
    meta: { dimension: 'country' },
};

const errorBody = (code: string, field: string, message: string, status: number) =>
    ({ error_code: code, errors: { [field]: [message] }, status_code: status });

describe('analytics', () => {
    let fetchStub: sinon.SinonStub | undefined;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        if (fetchStub !== undefined) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        delete process.env.ADAPTY_TOKEN;
        delete process.env.ADAPTY_API_URL;
    });

    describe('requests', () => {
        it('chart sends one POST with every flag translated, and --json prints the answer unchanged', async () => {
            fetchStub = mockFetchSteps([{ body: chartAnswer }]);

            const { stdout } = await runCommand([
                'analytics', 'chart',
                '--app', TEST_APP_ID,
                '--chart', 'revenue',
                '--date-from', '2026-07-01',
                '--date-to', '2026-09-30',
                '--compare-from', '2026-04-01',
                '--compare-to', '2026-06-30',
                '--group-by', 'country',
                '--filter', 'country=US,GB',
                '--filter', 'store=app_store',
                '--filter', 'country=GB,DE',
                '--granularity', 'week',
                '--revenue-basis', 'net',
                '--timezone', 'Europe/Berlin',
                '--json',
            ]);

            expect(JSON.parse(stdout)).to.deep.equal(chartAnswer);
            expect(fetchStub.callCount).to.equal(1);
            assertFetch({ callIndex: 0, method: 'POST', path: `${ANALYTICS}/metrics/`, stub: fetchStub });

            const request = requestOf(fetchStub, 0);

            expect(request.headers.get('authorization')).to.equal('Bearer test-token');

            // Two filters of one dimension are one list, as the dashboard sends it: a value of either is kept
            expect(request.body).to.deep.equal({
                chart_id: 'revenue',
                filters: {
                    compare_date: ['2026-04-01', '2026-06-30'],
                    country: ['US', 'GB', 'DE'],
                    date: ['2026-07-01', '2026-09-30'],
                    store: ['app_store'],
                },
                period_unit: 'week',
                revenue_basis: 'net',
                segmentation: 'country',
                timezone: 'Europe/Berlin',
            });
        });

        it('sends each operation to its route with its own fields, and leaves out what was not given', async () => {
            const cases = [
                {
                    body: { filters: { date: ['2026-07-01', '2026-09-30'] } },
                    command: `analytics funnel ${APP} ${PERIOD}`,
                    path: 'funnel',
                },
                {
                    body: { filters: { date: ['2026-07-01', '2026-09-30'] }, segmentation: 'country', use_trial: true },
                    command: `analytics retention ${APP} ${PERIOD} --group-by country --use-trial`,
                    path: 'retention',
                },
                {
                    body: {
                        filters: { compare_date: ['2026-04-01', '2026-06-30'], date: ['2026-07-01', '2026-09-30'] },
                        conversion_id: 'trial-paid',
                        period_unit: 'month',
                    },
                    command: `analytics conversion ${APP} ${PERIOD} --conversion trial-paid --granularity month --compare-from 2026-04-01 --compare-to 2026-06-30`,
                    path: 'conversion',
                },
                {
                    body: {
                        filters: { date: ['2026-07-01', '2026-09-30'] },
                        period_type: 'days',
                        renewal_days: [7, 30, 90],
                        revenue_basis: 'proceeds',
                        segmentation: 'store',
                    },
                    command: `analytics ltv ${APP} ${PERIOD} --group-by store --revenue-basis proceeds --period-type days --renewal-days 7,30 --renewal-days 90`,
                    path: 'ltv',
                },
                {
                    body: { filters: { date: ['2026-07-01', '2026-09-30'] }, period_type: 'renewals', period_unit: 'week' },
                    command: `analytics cohort ${APP} ${PERIOD} --granularity week --period-type renewals`,
                    path: 'cohort',
                },
                {
                    body: { chart_id: 'installs', filters: { date: ['2026-07-01', '2026-09-30'] } },
                    command: `analytics chart ${APP} ${PERIOD} --chart installs`,
                    path: 'metrics',
                },
            ];

            fetchStub = mockFetchSteps([{ body: funnelAnswer }]);

            for (const [index, { body, command, path }] of cases.entries()) {
                await runCommand(`${command} --json`);

                assertFetch({ callIndex: index, method: 'POST', path: `${ANALYTICS}/${path}/`, stub: fetchStub });
                expect(requestOf(fetchStub, index).body, command).to.deep.equal(body);
            }

            expect(fetchStub.callCount).to.equal(cases.length);
        });

        it('reads the catalog and the values of a filter with GETs, and --json prints them unchanged', async () => {
            const stub = mockFetchSteps([{ body: catalogAnswer }, { body: valuesAnswer }]);

            fetchStub = stub;

            const catalog = await runCommand(`analytics catalog ${APP} --json`);
            const values = await runCommand(`analytics values ${APP} --dimension country --json`);

            expect(JSON.parse(catalog.stdout)).to.deep.equal(catalogAnswer);
            expect(JSON.parse(values.stdout)).to.deep.equal(valuesAnswer);
            assertFetch({ callIndex: 0, method: 'GET', path: `${ANALYTICS}/catalog/`, stub });
            assertFetch({ callIndex: 1, method: 'GET', path: `${ANALYTICS}/values/`, query: { dimension: 'country' }, stub });
            expect(requestOf(stub, 0).body).to.equal(undefined);
        });
    });

    describe('output', () => {
        // One row per operation: the total first, 0 kept, null as `—` (human) and an empty cell (CSV), the "No Data"
        // key "" kept apart from a null key, and every point under its x (or its step title).
        const operations = [
            {
                answer: chartAnswer,
                command: `analytics chart ${APP} ${PERIOD} --chart revenue`,
                csv: [
                    'period,key,title,is_total,value,2026-07-01,2026-08-01,2026-06-01',
                    'main,,Total,true,30.5,30.5,0,',
                    'main,US,United States,false,30.5,30.5,0,',
                    'main,"",No Data,false,0,0,,',
                    'compare,,Total,true,12,,,12',
                ],
                human: [
                    'value: 30.5',
                    'timezone: UTC',
                    'timezone_source: app',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 30.5',
                    'values:',
                    '  2026-07-01: 30.5',
                    '  2026-08-01: 0',
                    '---',
                    'key: US',
                    'title: United States',
                    'is_total: false',
                    'value: 30.5',
                    'values:',
                    '  2026-07-01: 30.5',
                    '  2026-08-01: 0',
                    '---',
                    'key: ""',
                    'title: No Data',
                    'is_total: false',
                    'value: 0',
                    'values:',
                    '  2026-07-01: 0',
                    '',
                    'Compared period',
                    'value: 12',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 12',
                    'values:',
                    '  2026-06-01: 12',
                ],
            },
            {
                answer: conversionAnswer,
                command: `analytics conversion ${APP} ${PERIOD} --conversion trial-paid`,
                csv: [
                    'period,key,title,is_total,value,value_from,value_to,2026-07-01',
                    'main,,Conversion rate from trial to paid,true,25,4,1,25',
                    'main,US,United States,false,0,4,0,',
                ],
                human: [
                    'value: 25',
                    'value_from: 4',
                    'value_to: 1',
                    'timezone: UTC',
                    'timezone_source: app',
                    '',
                    'key: —',
                    'title: Conversion rate from trial to paid',
                    'is_total: true',
                    'value: 25',
                    'value_from: 4',
                    'value_to: 1',
                    'values:',
                    '  2026-07-01: 25 (has_unfinished false, value_from 4, value_from_unfinished 0, value_to 1)',
                    '---',
                    'key: US',
                    'title: United States',
                    'is_total: false',
                    'value: 0',
                    'value_from: 4',
                    'value_to: 0',
                ],
            },
            {
                answer: funnelAnswer,
                command: `analytics funnel ${APP} ${PERIOD}`,
                csv: [
                    'key,title,is_total,value,Install,Paywall displayed',
                    ',Total,true,3,3,0',
                    'US,United States,false,,,',
                ],
                human: [
                    'value: 3',
                    'timezone: UTC',
                    'timezone_source: app',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 3',
                    'values:',
                    '  Install: 3 (value_relative 100)',
                    '  Paywall displayed: 0 (value_relative 0)',
                    '---',
                    'key: US',
                    'title: United States',
                    'is_total: false',
                    'value: —',
                ],
            },
            {
                answer: retentionAnswer,
                command: `analytics retention ${APP} ${PERIOD}`,
                csv: [
                    'key,title,is_total,value,first_value,Paid',
                    ',Total,true,5,5,5',
                    'US,United States,false,0,0,0',
                ],
                human: [
                    'value: 5',
                    'timezone: UTC',
                    'timezone_source: app',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 5',
                    'first_value: 5',
                    'values:',
                    '  Paid: 5 (value_relative 100)',
                    '---',
                    'key: US',
                    'title: United States',
                    'is_total: false',
                    'value: 0',
                    'first_value: 0',
                    'values:',
                    '  Paid: 0 (value_relative 0)',
                ],
            },
            {
                answer: ltvAnswer,
                command: `analytics ltv ${APP} ${PERIOD}`,
                csv: [
                    'key,title,is_total,value,cohort_size,1,2',
                    ',Total,true,1.5,2,1.5,',
                    'US,United States,false,0,1,0,',
                ],
                human: [
                    'value: 1.5',
                    'timezone: UTC',
                    'timezone_source: app',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 1.5',
                    'cohort_size: 2',
                    'values:',
                    '  1: 1.5',
                    '  2: —',
                    '---',
                    'key: US',
                    'title: United States',
                    'is_total: false',
                    'value: 0',
                    'cohort_size: 1',
                    'values:',
                    '  1: 0',
                    '  2: —',
                ],
            },
            {
                answer: cohortAnswer,
                command: `analytics cohort ${APP} ${PERIOD}`,
                csv: [
                    `key,title,is_total,value,installs,subscriptions,subscribers,arpu,arppu,arpas,${PREDICT_HEADER},1`,
                    ',Total,true,10,3,1,1,3.5,10,10,,,,,,,,,,,,,10',
                    '2026-07-01,2026-07-01,false,0,0,0,0,0,0,0,,0,,,,,,,,,,,',
                ],
                human: [
                    'value: 10',
                    'timezone: UTC',
                    'timezone_source: app',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 10',
                    'installs: 3',
                    'subscriptions: 1',
                    'subscribers: 1',
                    'arpu: 3.5',
                    'arppu: 10',
                    'arpas: 10',
                    'predict.rev3: —',
                    'predict.rev6: —',
                    'predict.rev9: —',
                    'predict.rev12: —',
                    'predict.rev18: —',
                    'predict.rev24: —',
                    'predict.ltv3: —',
                    'predict.ltv6: —',
                    'predict.ltv9: —',
                    'predict.ltv12: —',
                    'predict.ltv18: —',
                    'predict.ltv24: —',
                    'values:',
                    '  1: 10 (arpas 10, arppu 10, arpu 3.5, currently_active_period true, installs 3, subscribers 1, '
                    + 'subscribers_relative 100, subscriptions 1, subscriptions_relative 100, value_relative 100)',
                    '---',
                    'key: 2026-07-01',
                    'title: 2026-07-01',
                    'is_total: false',
                    'value: 0',
                    'installs: 0',
                    'subscriptions: 0',
                    'subscribers: 0',
                    'arpu: 0',
                    'arppu: 0',
                    'arpas: 0',
                    'predict.rev3: —',
                    'predict.rev6: 0',
                    'predict.rev9: —',
                    'predict.rev12: —',
                    'predict.rev18: —',
                    'predict.rev24: —',
                    'predict.ltv3: —',
                    'predict.ltv6: —',
                    'predict.ltv9: —',
                    'predict.ltv12: —',
                    'predict.ltv18: —',
                    'predict.ltv24: —',
                ],
            },
        ];

        it('prints every operation with the total first, 0 as 0 and null never as 0, in the human view and in CSV', async () => {
            for (const { answer, command, csv, human } of operations) {
                fetchStub = mockFetchSteps([{ body: answer }]);

                const humanRun = await runCommand(command);
                const csvRun = await runCommand(`${command} --csv`);

                expect(humanRun.stdout, command).to.equal(`${human.join('\n')}\n`);
                expect(csvRun.stdout, `${command} --csv`).to.equal(`${csv.join('\n')}\n`);

                restoreFetch(fetchStub);
                fetchStub = undefined;
            }
        });

        it('prints "No data for this period." for an answer without segments, and a CSV of the header alone', async () => {
            const empty = [
                { command: `analytics chart ${APP} ${PERIOD} --chart revenue`, data: { compare: null, segments: [], value: 0 }, header: 'period,key,title,is_total,value' },
                { command: `analytics funnel ${APP} ${PERIOD}`, data: { segments: [], value: null }, header: 'key,title,is_total,value' },
                { command: `analytics retention ${APP} ${PERIOD}`, data: { segments: [], value: null }, header: 'key,title,is_total,value,first_value' },
                { command: `analytics ltv ${APP} ${PERIOD}`, data: { segments: [], value: 0 }, header: 'key,title,is_total,value,cohort_size' },
                {
                    command: `analytics cohort ${APP} ${PERIOD}`,
                    data: { segments: [], value: null },
                    header: `key,title,is_total,value,installs,subscriptions,subscribers,arpu,arppu,arpas,${PREDICT_HEADER}`,
                },
            ];

            for (const { command, data, header } of empty) {
                fetchStub = mockFetchSteps([{ body: { data, meta } }]);

                const humanRun = await runCommand(command);
                const csvRun = await runCommand(`${command} --csv`);

                expect(humanRun.stdout, command).to.equal('No data for this period.\n');
                expect(csvRun.stdout, `${command} --csv`).to.equal(`${header}\n`);

                restoreFetch(fetchStub);
                fetchStub = undefined;
            }
        });

        it('names the window with data that the API recommends when a conversion has none', async () => {
            fetchStub = mockFetchSteps([{
                body: {
                    data: { compare: null, segments: [], value: 0, value_from: 0, value_to: 0 },
                    meta: { ...meta, recommended_period: { date_from: '2026-01-01', date_to: '2026-03-31', period_unit: 'day' } },
                },
            }]);

            const { stdout } = await runCommand(`analytics conversion ${APP} ${PERIOD} --conversion trial-paid`);

            expect(stdout).to.equal([
                'No data for this period.',
                'recommended_period: date_from 2026-01-01, date_to 2026-03-31, period_unit day',
                '',
            ].join('\n'));
        });

        it('quotes a CSV cell with a comma, a quote or a line break, and doubles the quote', async () => {
            fetchStub = mockFetchSteps([{
                body: {
                    data: {
                        segments: [{ is_total: false, key: 'p1', title: 'Pro, "annual"\nplan', value: 2, values: [] }],
                        value: 2,
                    },
                    meta,
                },
            }]);

            const { stdout } = await runCommand(`analytics funnel ${APP} ${PERIOD} --csv`);

            expect(stdout).to.equal('key,title,is_total,value\np1,"Pro, ""annual""\nplan",false,2\n');
        });

        it('prints the catalog and the filter values for a human reader', async () => {
            fetchStub = mockFetchSteps([{ body: catalogAnswer }, { body: valuesAnswer }]);

            const catalog = await runCommand(`analytics catalog ${APP}`);
            const values = await runCommand(`analytics values ${APP} --dimension country`);

            expect(catalog.stdout).to.equal([
                'Operations',
                'metrics (POST metrics/; can compare two periods)',
                '  options: period_unit day|month (default month)',
                '  groupings: per chart, see Charts',
                '  filters: per chart, see Charts',
                'retention (POST retention/; one period only)',
                '  options: use_trial (default false); timezone',
                '  groupings: country',
                '  filters: country',
                '',
                'Charts',
                'revenue: Revenue (USD, takes revenue_basis)',
                '  groupings: country',
                '  filters: country, store',
                '',
                'Conversions',
                'trial-paid: Trial → Paid',
                '',
                'Dimensions',
                'country: Country',
                '',
            ].join('\n'));

            expect(values.stdout).to.equal('DE: Germany (Europe)\n"": No Data\n');
        });
    });

    describe('bad input', () => {
        it('exits 2 and names the flag, without a request', async () => {
            fetchStub = mockFetchSteps([{ body: funnelAnswer }]);

            const cases = [
                { command: `analytics funnel ${APP} --date-from 2026-07-01`, message: 'date-to' },
                { command: `analytics funnel ${APP} --date-from 01.07.2026 --date-to 2026-09-30`, message: 'YYYY-MM-DD' },
                { command: `analytics funnel ${APP} --date-from 2026-02-30 --date-to 2026-03-31`, message: '--date-from: must be a date in YYYY-MM-DD form' },
                { command: `analytics funnel ${APP} --date-from 2026-09-30 --date-to 2026-07-01`, message: '--date-to: must not be before the start date' },
                { command: `analytics funnel --app not-a-uuid ${PERIOD}`, message: 'Invalid app ID format. Run `adapty apps list` to find your app ID.' },
                { command: `analytics chart ${APP} ${PERIOD} --chart revenu`, message: 'revenu' },
                { command: `analytics conversion ${APP} ${PERIOD} --conversion trial-to-paid`, message: 'trial-to-paid' },
                { command: `analytics chart ${APP} ${PERIOD} --chart revenue --compare-from 2026-04-01`, message: '--compare-to: required with the start of the compared period' },
                { command: `analytics conversion ${APP} ${PERIOD} --conversion trial-paid --compare-to 2026-06-30`, message: '--compare-from: required with the end of the compared period' },
                { command: `analytics chart ${APP} ${PERIOD} --chart revenue --compare-from 2026-06-30 --compare-to 2026-04-01`, message: '--compare-to: must not be before the start date' },
                // The funnel, retention, LTV and cohort queries cannot keep two periods apart: no compare flag at all
                { command: `analytics funnel ${APP} ${PERIOD} --compare-from 2026-04-01 --compare-to 2026-06-30`, message: '--compare-from' },
                { command: `analytics cohort ${APP} ${PERIOD} --group-by country`, message: '--group-by' },
                { command: `analytics ltv ${APP} ${PERIOD} --renewal-days 7,30`, message: '--renewal-days: needs --period-type days' },
                { command: `analytics cohort ${APP} ${PERIOD} --period-type renewals --renewal-days 7`, message: '--renewal-days: needs --period-type days' },
                { command: `analytics ltv ${APP} ${PERIOD} --period-type days --renewal-days -1`, message: 'renewal-days' },
                { command: `analytics funnel ${APP} ${PERIOD} --filter country`, message: 'dimension=value' },
                { command: `analytics funnel ${APP} ${PERIOD} --filter date=2026-07-01`, message: '--filter: date is not a filter' },
                { command: `analytics ltv ${APP} ${PERIOD} --revenue-basis net_net`, message: 'net_net' },
                { command: `analytics values ${APP}`, message: 'dimension' },
            ];

            for (const { command, message } of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
                expect(error?.message, command).to.contain(message);
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('refuses --csv with --json with exit 2, the error in the --json shape, without a request', async () => {
            fetchStub = mockFetchSteps([{ body: funnelAnswer }]);
            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stdout } = await runCommand(`analytics funnel ${APP} ${PERIOD} --csv --json`);
            const exit = process.exitCode;

            process.exitCode = 0;

            const { error } = JSON.parse(stdout) as { error: { message: string } };

            expect(exit).to.equal(exitCode.usage);
            expect(error.message).to.contain('--json=true cannot also be provided when using --csv');
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('refusals', () => {
        it('turns a server refusal into exit 4 with the error code, in the human view and under --json', async () => {
            const refusal = {
                body: errorBody('analytics_field_not_supported', 'segmentation', 'retention has no grouping "color".', 400),
                status: 400,
            };

            fetchStub = mockFetchSteps([refusal]);

            const human = await runCommand(`analytics retention ${APP} ${PERIOD} --group-by color`);

            expect(human.error?.oclif?.exit).to.equal(exitCode.api);
            expect(human.error?.code).to.equal('analytics_field_not_supported');
            expect(human.error?.message).to.equal('segmentation: retention has no grouping "color".');

            process.exitCode = undefined;

            const { stdout } = await runCommand(`analytics retention ${APP} ${PERIOD} --group-by color --json`);
            const exit = process.exitCode;

            process.exitCode = 0;

            const { error } = JSON.parse(stdout) as { error: { code: string; status: number } };

            expect(exit).to.equal(exitCode.api);
            expect(error.code).to.equal('analytics_field_not_supported');
            expect(error.status).to.equal(400);
        });

        it('exits 4 on the rate limit after exactly one request, and hands the wait to --json', async () => {
            const limited = {
                body: { error_code: 'throttled', errors: { non_field_errors: ['Request was throttled.'] }, status_code: 429 },
                headers: { 'retry-after': '1' },
                status: 429,
            };

            fetchStub = mockFetchSteps([limited, { body: cohortAnswer }]);

            const { stdout } = await runCommand(`analytics cohort ${APP} ${PERIOD} --json`);
            const json = JSON.parse(stdout) as { error: { code: string; retry_after_seconds?: number } };

            expect(json.error.code).to.equal('throttled');
            expect(json.error.retry_after_seconds).to.equal(1);
            expect(fetchStub.callCount).to.equal(1);
        });

        it('exits 3 when the API refuses the token or the app', async () => {
            fetchStub = mockFetchSteps([{
                body: { error_code: 'not_authenticated', errors: { non_field_errors: ['Authentication credentials were not provided.'] }, status_code: 403 },
                status: 403,
            }]);

            const { error } = await runCommand(`analytics catalog ${APP}`);

            expect(error?.oclif?.exit).to.equal(exitCode.auth);
            expect(error?.code).to.equal('not_authenticated');
        });
    });

    describe('without a token', () => {
        beforeEach(() => {
            delete process.env.ADAPTY_TOKEN;
        });

        it('exits 3 with the login hint before any request once the flags are valid', async () => {
            fetchStub = mockFetchSteps([{ body: funnelAnswer }]);

            const commands = [
                `analytics catalog ${APP}`,
                `analytics values ${APP} --dimension country`,
                `analytics chart ${APP} ${PERIOD} --chart revenue`,
                `analytics cohort ${APP} ${PERIOD}`,
                `analytics conversion ${APP} ${PERIOD} --conversion trial-paid`,
                `analytics funnel ${APP} ${PERIOD}`,
                `analytics ltv ${APP} ${PERIOD}`,
                `analytics retention ${APP} ${PERIOD}`,
            ];

            for (const command of commands) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.auth);
                expect(error?.message, command).to.equal('Not authenticated. Run `adapty auth login`.');
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('reports bad input first, not the missing token', async () => {
            fetchStub = mockFetchSteps([{ body: funnelAnswer }]);

            const { error } = await runCommand(`analytics funnel ${APP} --date-from 2026-09-30 --date-to 2026-07-01`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.not.contain('Not authenticated');
            expect(fetchStub.callCount).to.equal(0);
        });
    });
});
