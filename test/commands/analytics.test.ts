import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { assertFetch, mockFetchSteps, requestOf, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

import type * as sinon from 'sinon';

const ANALYTICS = `/apps/${TEST_APP_ID}/analytics`;
const PERIOD = '--date-from 2026-07-01 --date-to 2026-09-30';
const APP = `--app ${TEST_APP_ID}`;

const meta = { query: { timezone: 'UTC', filters: { date: ['2026-07-01', '2026-09-30'] }, timezone_source: 'app' } };

const sentBody = (stub: sinon.SinonStub, callIndex: number): unknown => JSON.parse(requestOf(stub, callIndex).body ?? 'null');

// The answers keep the field order of the API. Each lists a group before the total, so the views must put the
// total first themselves, and holds a 0 and, where the API has one, a null: 0 stays 0, null never reads as 0.
const chartAnswer = {
    data: {
        value: 30.5,
        compare: {
            value: 12,
            segments: [
                { key: null, title: 'Total', is_total: true, value: 12, values: [{ x: '2026-06-01', value: 12 }] },
                { key: 'DE', title: 'Germany', is_total: false, value: 2, values: [{ x: '2026-06-01', value: 2 }] },
                { key: 'US', title: 'United States', is_total: false, value: 10, values: [{ x: '2026-06-01', value: 10 }] },
            ],
        },
        segments: [
            { key: 'US', title: 'United States', is_total: false, value: 30.5, values: [{ x: '2026-07-01', value: 30.5 }, { x: '2026-08-01', value: 0 }] },
            { key: null, title: 'Total', is_total: true, value: 30.5, values: [{ x: '2026-07-01', value: 30.5 }, { x: '2026-08-01', value: 0 }] },
            { key: '', title: 'No Data', is_total: false, value: 0, values: [{ x: '2026-07-01', value: 0 }] },
        ],
    },
    meta,
};

const conversionAnswer = {
    data: {
        value: 25,
        value_from: 4,
        value_to: 1,
        compare: {
            value: 20,
            value_from: 5,
            value_to: 1,
            segments: [{
                key: null,
                title: 'Conversion rate from trial to paid',
                is_total: true,
                value: 20,
                value_from: 5,
                value_to: 1,
                values: [{ x: '2026-06-01', value: 20, value_from: 5, value_to: 1, value_from_unfinished: 0, has_unfinished: false }],
            }],
        },
        segments: [
            { key: 'US', title: 'United States', is_total: false, value: 0, value_from: 4, value_to: 0, values: [] },
            {
                key: null,
                title: 'Conversion rate from trial to paid',
                is_total: true,
                value: 25,
                value_from: 4,
                value_to: 1,
                values: [{ x: '2026-07-01', value: 25, value_from: 4, value_to: 1, value_from_unfinished: 0, has_unfinished: false }],
            },
        ],
    },
    meta: { ...meta, recommended_period: null },
};

const funnelAnswer = {
    data: {
        value: 3,
        segments: [
            {
                key: '00000000-0000-0000-0000-000000000000',
                title: 'No Data',
                is_total: false,
                value: 0,
                values: [{
                    x: -2, title: 'Install', value: 0, value_relative: 0, relative_changes: 0,
                    following_changes: { title: 'Drop off', value: 0, value_relative: 0 }, churn_reason_title: '', churn_reasons: [], parts: [],
                }],
            },
            {
                key: null,
                title: 'Total',
                is_total: true,
                value: 3,
                values: [
                    {
                        x: -2, title: 'Install', value: 3, value_relative: 100, relative_changes: 66.7,
                        following_changes: { title: 'Drop off', value: 1, value_relative: 33.3 }, churn_reason_title: '', churn_reasons: [], parts: [],
                    },
                    {
                        x: 0, title: 'Paid', value: 2, value_relative: 66.7, relative_changes: 0,
                        following_changes: { title: 'Drop off', value: 2, value_relative: 100 }, churn_reason_title: 'Churn reasons',
                        churn_reasons: [{ title: 'Cancelled', value: 2, value_relative: 100 }],
                        parts: [{ title: 'Install → Paid', value: 1, value_relative: 50 }],
                    },
                ],
            },
        ],
    },
    meta: { query: { ...meta.query, segmentation: 'paywall_id' } },
};

const retentionAnswer = {
    data: {
        value: 5,
        segments: [
            { key: 'US', title: 'United States', is_total: false, value: 0, first_value: 0, values: [{ x: 1, title: 'Paid', value: 0, value_relative: 0 }] },
            { key: null, title: 'Total', is_total: true, value: 5, first_value: 5, values: [{ x: 1, title: 'Paid', value: 5, value_relative: 100 }] },
        ],
    },
    meta,
};

const ltvAnswer = {
    data: {
        value: 1.5,
        segments: [
            { key: 'US', title: 'United States', is_total: false, value: 0, cohort_size: 1, values: [{ x: 1, value: 0 }, { x: 2, value: null }] },
            { key: null, title: 'Total', is_total: true, value: 1.5, cohort_size: 2, values: [{ x: 1, value: 1.5 }, { x: 2, value: null }] },
        ],
    },
    meta,
};

const money = (gross: number, proceeds: number, net: number) => ({ gross, proceeds, net });

const cohortAnswer = {
    data: {
        value: 10,
        segments: [
            {
                key: '2026-07-01', title: '2026-07-01', is_total: false, value: 0, start_date: '2026-07-01',
                installs: 0, subscriptions: 0, subscribers: 0,
                revenue: money(0, 0, 0), arpu: money(0, 0, 0), arppu: money(0, 0, 0), arpas: money(0, 0, 0),
                predict: {
                    gross: { rev3: null, rev6: 0 }, gross_v2: null, proceeds: null, net: null, status: { status_3: 0 },
                },
                values: [],
            },
            {
                key: null, title: 'Total', is_total: true, value: 10, start_date: '2026-07-01',
                installs: 3, subscriptions: 1, subscribers: 1,
                revenue: money(10, 8.5, 7), arpu: money(3.5, 2.8, 2.3),
                arppu: money(10, 8.5, 7), arpas: money(10, 8.5, 7),
                predict: null,
                values: [{
                    x: 1, value: 10, value_relative: 100, installs: 3, subscriptions: 1, subscriptions_relative: 100,
                    subscribers: 1, subscribers_relative: 100,
                    revenue: money(10, 8.5, 7), revenue_relative: money(100, 100, 100),
                    arpu: money(3.5, 2.8, 2.3), arppu: money(10, 8.5, 7), arpas: money(10, 8.5, 7),
                    currently_active_period: true,
                }],
            },
        ],
    },
    meta,
};

const catalogAnswer = {
    data: {
        charts: [{
            default_segmentation: null,
            filters: ['country', 'store'],
            id: 'revenue',
            segmentations: [{ key: 'country', label: 'Country', filter: 'country' }, { key: 'period', label: 'Period', filter: null }],
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
                segmentations: [{ key: 'country', label: 'Country', filter: 'country' }],
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
            expect(sentBody(fetchStub, 0)).to.deep.equal({
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
                expect(sentBody(fetchStub, index), command).to.deep.equal(body);
            }

            expect(fetchStub.callCount).to.equal(cases.length);
        });

        it('sends --filter values exactly as written: an empty value keeps the "No Data" group', async () => {
            fetchStub = mockFetchSteps([{ body: chartAnswer }]);

            await runCommand([
                'analytics', 'chart', '--app', TEST_APP_ID, '--chart', 'revenue',
                '--date-from', '2026-07-01', '--date-to', '2026-09-30',
                '--filter', 'country=',
                '--filter', 'paywall_id=00000000-0000-0000-0000-000000000000',
                '--filter', String.raw`attribution_campaign=Summer\,2026,`,
                '--json',
            ]);

            expect(sentBody(fetchStub, 0)).to.deep.equal({
                chart_id: 'revenue',
                filters: {
                    attribution_campaign: ['Summer,2026', ''],
                    country: [''],
                    date: ['2026-07-01', '2026-09-30'],
                    paywall_id: ['00000000-0000-0000-0000-000000000000'],
                },
            });
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
                    'key,title,is_total,value,2026-07-01,2026-08-01,compare.value,compare.2026-06-01,data.value,data.compare.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    ',Total,true,30.5,30.5,0,12,12,30.5,12,UTC,2026-07-01,2026-09-30,app',
                    'US,United States,false,30.5,30.5,0,10,10,30.5,12,UTC,2026-07-01,2026-09-30,app',
                    '"",No Data,false,0,0,,,,30.5,12,UTC,2026-07-01,2026-09-30,app',
                    'DE,Germany,false,,,,2,2,30.5,12,UTC,2026-07-01,2026-09-30,app',
                ],
                human: [
                    'value: 30.5',
                    'timezone: UTC',
                    'filters.date[0]: 2026-07-01',
                    'filters.date[1]: 2026-09-30',
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
                    '---',
                    'key: DE',
                    'title: Germany',
                    'is_total: false',
                    'value: 2',
                    'values:',
                    '  2026-06-01: 2',
                    '---',
                    'key: US',
                    'title: United States',
                    'is_total: false',
                    'value: 10',
                    'values:',
                    '  2026-06-01: 10',
                ],
            },
            {
                answer: conversionAnswer,
                command: `analytics conversion ${APP} ${PERIOD} --conversion trial-paid`,
                csv: [
                    'key,title,is_total,value,value_from,value_to,2026-07-01,2026-07-01.value_from,2026-07-01.value_to,2026-07-01.value_from_unfinished,2026-07-01.has_unfinished,compare.value,compare.value_from,compare.value_to,compare.2026-06-01,compare.2026-06-01.value_from,compare.2026-06-01.value_to,compare.2026-06-01.value_from_unfinished,compare.2026-06-01.has_unfinished,data.value,data.value_from,data.value_to,data.compare.value,data.compare.value_from,data.compare.value_to,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source,meta.recommended_period',
                    ',Conversion rate from trial to paid,true,25,4,1,25,4,1,0,false,20,5,1,20,5,1,0,false,25,4,1,20,5,1,UTC,2026-07-01,2026-09-30,app,',
                    'US,United States,false,0,4,0,,,,,,,,,,,,,,25,4,1,20,5,1,UTC,2026-07-01,2026-09-30,app,',
                ],
                human: [
                    'value: 25',
                    'value_from: 4',
                    'value_to: 1',
                    'timezone: UTC',
                    'filters.date[0]: 2026-07-01',
                    'filters.date[1]: 2026-09-30',
                    'timezone_source: app',
                    'recommended_period: —',
                    '',
                    'key: —',
                    'title: Conversion rate from trial to paid',
                    'is_total: true',
                    'value: 25',
                    'value_from: 4',
                    'value_to: 1',
                    'values:',
                    '  2026-07-01: 25 (value_from 4, value_to 1, value_from_unfinished 0, has_unfinished false)',
                    '---',
                    'key: US',
                    'title: United States',
                    'is_total: false',
                    'value: 0',
                    'value_from: 4',
                    'value_to: 0',
                    '',
                    'Compared period',
                    'value: 20',
                    'value_from: 5',
                    'value_to: 1',
                    '',
                    'key: —',
                    'title: Conversion rate from trial to paid',
                    'is_total: true',
                    'value: 20',
                    'value_from: 5',
                    'value_to: 1',
                    'values:',
                    '  2026-06-01: 20 (value_from 5, value_to 1, value_from_unfinished 0, has_unfinished false)',
                ],
            },
            {
                answer: funnelAnswer,
                command: `analytics funnel ${APP} ${PERIOD}`,
                csv: [
                    'key,title,is_total,value,-2,-2.title,-2.value_relative,-2.relative_changes,-2.following_changes.title,-2.following_changes.value,-2.following_changes.value_relative,-2.churn_reason_title,0,0.title,0.value_relative,0.relative_changes,0.following_changes.title,0.following_changes.value,0.following_changes.value_relative,0.churn_reason_title,0.churn_reasons[0].title,0.churn_reasons[0].value,0.churn_reasons[0].value_relative,0.parts[0].title,0.parts[0].value,0.parts[0].value_relative,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source,meta.query.segmentation',
                    ',Total,true,3,3,Install,100,66.7,Drop off,1,33.3,"",2,Paid,66.7,0,Drop off,2,100,Churn reasons,Cancelled,2,100,Install → Paid,1,50,3,UTC,2026-07-01,2026-09-30,app,paywall_id',
                    '00000000-0000-0000-0000-000000000000,No Data,false,0,0,Install,0,0,Drop off,0,0,"",,,,,,,,,,,,,,,3,UTC,2026-07-01,2026-09-30,app,paywall_id',
                ],
                human: [
                    'value: 3',
                    'timezone: UTC',
                    'filters.date[0]: 2026-07-01',
                    'filters.date[1]: 2026-09-30',
                    'timezone_source: app',
                    'segmentation: paywall_id',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 3',
                    'values:',
                    '  -2 Install: 3 (value_relative 100, relative_changes 66.7, following_changes.title Drop off, following_changes.value 1, following_changes.value_relative 33.3, churn_reason_title "")',
                    '  0 Paid: 2 (value_relative 66.7, relative_changes 0, following_changes.title Drop off, following_changes.value 2, following_changes.value_relative 100, churn_reason_title Churn reasons, churn_reasons[0].title Cancelled, churn_reasons[0].value 2, churn_reasons[0].value_relative 100, parts[0].title Install → Paid, parts[0].value 1, parts[0].value_relative 50)',
                    '---',
                    'key: 00000000-0000-0000-0000-000000000000',
                    'title: No Data',
                    'is_total: false',
                    'value: 0',
                    'values:',
                    '  -2 Install: 0 (value_relative 0, relative_changes 0, following_changes.title Drop off, following_changes.value 0, following_changes.value_relative 0, churn_reason_title "")',
                ],
            },
            {
                answer: retentionAnswer,
                command: `analytics retention ${APP} ${PERIOD}`,
                csv: [
                    'key,title,is_total,value,first_value,1,1.title,1.value_relative,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    ',Total,true,5,5,5,Paid,100,5,UTC,2026-07-01,2026-09-30,app',
                    'US,United States,false,0,0,0,Paid,0,5,UTC,2026-07-01,2026-09-30,app',
                ],
                human: [
                    'value: 5',
                    'timezone: UTC',
                    'filters.date[0]: 2026-07-01',
                    'filters.date[1]: 2026-09-30',
                    'timezone_source: app',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 5',
                    'first_value: 5',
                    'values:',
                    '  1 Paid: 5 (value_relative 100)',
                    '---',
                    'key: US',
                    'title: United States',
                    'is_total: false',
                    'value: 0',
                    'first_value: 0',
                    'values:',
                    '  1 Paid: 0 (value_relative 0)',
                ],
            },
            {
                answer: ltvAnswer,
                command: `analytics ltv ${APP} ${PERIOD}`,
                csv: [
                    'key,title,is_total,value,cohort_size,1,2,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    ',Total,true,1.5,2,1.5,,1.5,UTC,2026-07-01,2026-09-30,app',
                    'US,United States,false,0,1,0,,1.5,UTC,2026-07-01,2026-09-30,app',
                ],
                human: [
                    'value: 1.5',
                    'timezone: UTC',
                    'filters.date[0]: 2026-07-01',
                    'filters.date[1]: 2026-09-30',
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
                    'key,title,is_total,value,start_date,installs,subscriptions,subscribers,revenue.gross,revenue.proceeds,revenue.net,arpu.gross,arpu.proceeds,arpu.net,arppu.gross,arppu.proceeds,arppu.net,arpas.gross,arpas.proceeds,arpas.net,predict.gross.rev3,predict.gross.rev6,predict.gross_v2,predict.proceeds,predict.net,predict.status.status_3,1,1.value_relative,1.installs,1.subscriptions,1.subscriptions_relative,1.subscribers,1.subscribers_relative,1.revenue.gross,1.revenue.proceeds,1.revenue.net,1.revenue_relative.gross,1.revenue_relative.proceeds,1.revenue_relative.net,1.arpu.gross,1.arpu.proceeds,1.arpu.net,1.arppu.gross,1.arppu.proceeds,1.arppu.net,1.arpas.gross,1.arpas.proceeds,1.arpas.net,1.currently_active_period,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    ',Total,true,10,2026-07-01,3,1,1,10,8.5,7,3.5,2.8,2.3,10,8.5,7,10,8.5,7,,,,,,,10,100,3,1,100,1,100,10,8.5,7,100,100,100,3.5,2.8,2.3,10,8.5,7,10,8.5,7,true,10,UTC,2026-07-01,2026-09-30,app',
                    '2026-07-01,2026-07-01,false,0,2026-07-01,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,,0,,,,0,,,,,,,,,,,,,,,,,,,,,,,,10,UTC,2026-07-01,2026-09-30,app',
                ],
                human: [
                    'value: 10',
                    'timezone: UTC',
                    'filters.date[0]: 2026-07-01',
                    'filters.date[1]: 2026-09-30',
                    'timezone_source: app',
                    '',
                    'key: —',
                    'title: Total',
                    'is_total: true',
                    'value: 10',
                    'start_date: 2026-07-01',
                    'installs: 3',
                    'subscriptions: 1',
                    'subscribers: 1',
                    'revenue.gross: 10',
                    'revenue.proceeds: 8.5',
                    'revenue.net: 7',
                    'arpu.gross: 3.5',
                    'arpu.proceeds: 2.8',
                    'arpu.net: 2.3',
                    'arppu.gross: 10',
                    'arppu.proceeds: 8.5',
                    'arppu.net: 7',
                    'arpas.gross: 10',
                    'arpas.proceeds: 8.5',
                    'arpas.net: 7',
                    'predict: —',
                    'values:',
                    '  1: 10 (value_relative 100, installs 3, subscriptions 1, subscriptions_relative 100, subscribers 1, subscribers_relative 100, revenue.gross 10, revenue.proceeds 8.5, revenue.net 7, revenue_relative.gross 100, revenue_relative.proceeds 100, revenue_relative.net 100, arpu.gross 3.5, arpu.proceeds 2.8, arpu.net 2.3, arppu.gross 10, arppu.proceeds 8.5, arppu.net 7, arpas.gross 10, arpas.proceeds 8.5, arpas.net 7, currently_active_period true)',
                    '---',
                    'key: 2026-07-01',
                    'title: 2026-07-01',
                    'is_total: false',
                    'value: 0',
                    'start_date: 2026-07-01',
                    'installs: 0',
                    'subscriptions: 0',
                    'subscribers: 0',
                    'revenue.gross: 0',
                    'revenue.proceeds: 0',
                    'revenue.net: 0',
                    'arpu.gross: 0',
                    'arpu.proceeds: 0',
                    'arpu.net: 0',
                    'arppu.gross: 0',
                    'arppu.proceeds: 0',
                    'arppu.net: 0',
                    'arpas.gross: 0',
                    'arpas.proceeds: 0',
                    'arpas.net: 0',
                    'predict.gross.rev3: —',
                    'predict.gross.rev6: 0',
                    'predict.gross_v2: —',
                    'predict.proceeds: —',
                    'predict.net: —',
                    'predict.status.status_3: 0',
                ],
            },
        ];

        it('prints every operation with the total first, 0 as 0 and null never as 0, in the human view and in CSV '
            + '(one row per group, a compared period in compare.* columns)', async () => {
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

        it('prints "No data for this period." and the summary the API gives for an answer without segments', async () => {
            // No segments: the human view and, with --csv, stderr show every number of the period (null as —), its
            // time zone and a conversion's recommended window; the CSV on stdout is its header alone, no row
            const tz = ['timezone: UTC', 'filters.date[0]: 2026-07-01', 'filters.date[1]: 2026-09-30', 'timezone_source: app'];
            const recommended = { date_from: '2026-01-01', date_to: '2026-03-31', period_unit: 'day' };

            const empty = [
                {
                    command: `analytics chart ${APP} ${PERIOD} --chart revenue`,
                    csv: 'key,title,is_total,value,data.value,data.compare.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    data: { value: 0, compare: { value: 12, segments: [] }, segments: [] },
                    human: ['No data for this period.', 'value: 0', ...tz, '', 'Compared period', 'No data for this period.', 'value: 12'],
                    meta,
                },
                {
                    command: `analytics conversion ${APP} ${PERIOD} --conversion trial-paid`,
                    csv: 'key,title,is_total,value,data.value,data.value_from,data.value_to,data.compare,meta.query.timezone,'
                        + 'meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source,meta.recommended_period.date_from,meta.recommended_period.date_to,'
                        + 'meta.recommended_period.period_unit',
                    data: { value: 0, value_from: 0, value_to: 0, compare: null, segments: [] },
                    human: [
                        'No data for this period.', 'value: 0', 'value_from: 0', 'value_to: 0', ...tz,
                        'recommended_period.date_from: 2026-01-01', 'recommended_period.date_to: 2026-03-31',
                        'recommended_period.period_unit: day',
                    ],
                    meta: { ...meta, recommended_period: recommended },
                },
                {
                    command: `analytics funnel ${APP} ${PERIOD}`,
                    csv: 'key,title,is_total,value,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    data: { value: null, segments: [] },
                    human: ['No data for this period.', 'value: —', ...tz],
                    meta,
                },
                {
                    command: `analytics retention ${APP} ${PERIOD}`,
                    csv: 'key,title,is_total,value,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    data: { value: null, segments: [] },
                    human: ['No data for this period.', 'value: —', ...tz],
                    meta,
                },
                {
                    command: `analytics ltv ${APP} ${PERIOD}`,
                    csv: 'key,title,is_total,value,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    data: { value: 0, segments: [] },
                    human: ['No data for this period.', 'value: 0', ...tz],
                    meta,
                },
                {
                    command: `analytics cohort ${APP} ${PERIOD}`,
                    csv: 'key,title,is_total,value,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                    data: { value: null, segments: [] },
                    human: ['No data for this period.', 'value: —', ...tz],
                    meta,
                },
            ];

            for (const { command, csv, data, human, meta: answerMeta } of empty) {
                fetchStub = mockFetchSteps([{ body: { data, meta: answerMeta } }]);

                const humanRun = await runCommand(command);
                const csvRun = await runCommand(`${command} --csv`);

                expect(humanRun.stdout, command).to.equal(`${human.join('\n')}\n`);
                expect(csvRun.stdout, `${command} --csv`).to.equal(`${csv}\n`);
                expect(csvRun.stderr, `${command} --csv`).to.equal(`${human.join('\n')}\n`);

                restoreFetch(fetchStub);
                fetchStub = undefined;
            }
        });

        it('shows the compared groups when the asked period has none: total first, the summary of both on stderr', async () => {
            fetchStub = mockFetchSteps([{
                body: {
                    data: {
                        value: 0,
                        compare: {
                            value: 12,
                            segments: [
                                { key: 'DE', title: 'Germany', is_total: false, value: 2, values: [{ x: '2026-06-01', value: 2 }] },
                                { key: null, title: 'Total', is_total: true, value: 12, values: [{ x: '2026-06-01', value: 12 }] },
                            ],
                        },
                        segments: [],
                    },
                    meta,
                },
            }]);

            const command = `analytics chart ${APP} ${PERIOD} --chart revenue --group-by country --compare-from 2026-04-01 --compare-to 2026-06-30`;
            const human = await runCommand(command);
            const csv = await runCommand(`${command} --csv`);

            expect(human.stdout).to.equal([
                'No data for this period.',
                'value: 0',
                'timezone: UTC',
                'filters.date[0]: 2026-07-01',
                'filters.date[1]: 2026-09-30',
                'timezone_source: app',
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
                '---',
                'key: DE',
                'title: Germany',
                'is_total: false',
                'value: 2',
                'values:',
                '  2026-06-01: 2',
                '',
            ].join('\n'));

            expect(csv.stdout).to.equal([
                'key,title,is_total,value,compare.value,compare.2026-06-01,data.value,data.compare.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                ',Total,true,,12,12,0,12,UTC,2026-07-01,2026-09-30,app',
                'DE,Germany,false,,2,2,0,12,UTC,2026-07-01,2026-09-30,app',
                '',
            ].join('\n'));

            expect(csv.stderr).to.equal([
                'No data for this period.',
                'value: 0',
                'timezone: UTC',
                'filters.date[0]: 2026-07-01',
                'filters.date[1]: 2026-09-30',
                'timezone_source: app',
                '',
                'Compared period',
                'value: 12',
                '',
            ].join('\n'));
        });

        it('quotes a CSV cell with a comma, a quote or a line break, and doubles the quote', async () => {
            fetchStub = mockFetchSteps([{
                body: {
                    data: {
                        value: 2,
                        segments: [{ key: 'p1', title: 'Pro, "annual"\nplan', is_total: false, value: 2, values: [] }],
                    },
                    meta,
                },
            }]);

            const { stdout } = await runCommand(`analytics funnel ${APP} ${PERIOD} --csv`);

            expect(stdout).to.equal([
                'key,title,is_total,value,data.value,meta.query.timezone,meta.query.filters.date[0],meta.query.filters.date[1],meta.query.timezone_source',
                'p1,"Pro, ""annual""\nplan",false,2,2,UTC,2026-07-01,2026-09-30,app',
                '',
            ].join('\n'));
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
                '  groupings: country (filter country)',
                '  filters: country',
                '',
                'Charts',
                'revenue: Revenue (USD, takes revenue_basis)',
                '  groupings: country (filter country), period (filter —)',
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

            // The whole message: oclif's own for a parse error, `Invalid input:` and the flag for a broken rule
            const cases = [
                { command: `analytics funnel ${APP} --date-from 2026-07-01`, message: 'The following error occurred:\n  Missing required flag date-to\nSee more help with --help' },
                { command: `analytics funnel ${APP} --date-from 01.07.2026 --date-to 2026-09-30`, message: 'Parsing --date-from \n\tDates must be written as YYYY-MM-DD.\nSee more help with --help' },
                { command: `analytics funnel ${APP} --date-from 2026-02-30 --date-to 2026-03-31`, message: 'Invalid input:\n  --date-from: must be a date in YYYY-MM-DD form' },
                { command: `analytics funnel ${APP} --date-from 2026-09-30 --date-to 2026-07-01`, message: 'Invalid input:\n  --date-to: must not be before the start date' },
                { command: `analytics funnel --app not-a-uuid ${PERIOD}`, message: 'Parsing --app \n\tInvalid app ID format. Run `adapty apps list` to find your app ID.\nSee more help with --help' },
                { command: `analytics chart ${APP} ${PERIOD} --chart revenue --compare-from 2026-04-01`, message: 'Invalid input:\n  --compare-to: required with --compare-from' },
                { command: `analytics conversion ${APP} ${PERIOD} --conversion trial-paid --compare-to 2026-06-30`, message: 'Invalid input:\n  --compare-from: required with --compare-to' },
                { command: `analytics chart ${APP} ${PERIOD} --chart revenue --compare-from 2026-06-30 --compare-to 2026-04-01`, message: 'Invalid input:\n  --compare-to: must not be before the start date' },
                // The funnel, retention, LTV and cohort queries cannot keep two periods apart: no compare flag at all
                { command: `analytics funnel ${APP} ${PERIOD} --compare-from 2026-04-01 --compare-to 2026-06-30`, message: 'Nonexistent flags: --compare-from, --compare-to\nSee more help with --help' },
                { command: `analytics cohort ${APP} ${PERIOD} --group-by country`, message: 'Nonexistent flag: --group-by\nSee more help with --help' },
                { command: `analytics ltv ${APP} ${PERIOD} --renewal-days 7,30`, message: 'Invalid input:\n  --renewal-days: needs --period-type days' },
                { command: `analytics cohort ${APP} ${PERIOD} --period-type renewals --renewal-days 7`, message: 'Invalid input:\n  --renewal-days: needs --period-type days' },
                { command: `analytics ltv ${APP} ${PERIOD} --period-type days --renewal-days 30,7`, message: 'Invalid input:\n  --renewal-days: must be whole days, 0 or more, in ascending order, each day once' },
                { command: `analytics cohort ${APP} ${PERIOD} --period-type days --renewal-days 7 --renewal-days 7`, message: 'Invalid input:\n  --renewal-days: must be whole days, 0 or more, in ascending order, each day once' },
                { command: `analytics ltv ${APP} ${PERIOD} --period-type days --renewal-days -1`, message: 'Parsing --renewal-days \n\tExpected an integer greater than or equal to 0 but received: -1\nSee more help with --help' },
                { command: `analytics funnel ${APP} ${PERIOD} --filter country`, message: 'Parsing --filter \n\tExpected dimension=value[,value] (an empty value is a "No Data" group), got "country".\nSee more help with --help' },
                { command: `analytics funnel ${APP} ${PERIOD} --filter date=2026-07-01`, message: 'Invalid input:\n  --filter: date is not a filter: the period has flags of its own' },
                { command: `analytics ltv ${APP} ${PERIOD} --revenue-basis net_net`, message: 'Expected --revenue-basis=net_net to be one of: gross, proceeds, net\nSee more help with --help' },
                { command: `analytics values ${APP}`, message: 'The following error occurred:\n  Missing required flag dimension\nSee more help with --help' },
            ];

            for (const { command, message } of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
                expect(error?.message, command).to.equal(message);
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 2 for a value outside a fixed list, naming the flag and the values it takes, without a request', async () => {
            fetchStub = mockFetchSteps([{ body: funnelAnswer }]);

            const cases = [
                { command: `analytics chart ${APP} ${PERIOD} --chart revenu`, sample: 'revenue, mrr, arr', start: 'Expected --chart=revenu to be one of: ' },
                { command: `analytics conversion ${APP} ${PERIOD} --conversion trial-to-paid`, sample: 'trial-paid', start: 'Expected --conversion=trial-to-paid to be one of: ' },
                { command: `analytics chart ${APP} ${PERIOD} --chart installs --revenue-basis net`, sample: 'revenue, mrr', start: 'Invalid input:\n  --revenue-basis: applies only to a money chart: ' },
            ];

            for (const { command, sample, start } of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
                expect(error?.message.startsWith(start), command).to.equal(true);
                expect(error?.message, command).to.contain(sample);
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

            fetchStub = mockFetchSteps([limited, limited, { body: cohortAnswer }]);

            const { error } = await runCommand(`analytics cohort ${APP} ${PERIOD}`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.code).to.equal('throttled');
            expect(fetchStub.callCount).to.equal(1);

            const { stdout } = await runCommand(`analytics cohort ${APP} ${PERIOD} --json`);
            const json = JSON.parse(stdout) as { error: { code: string; retry_after_seconds?: number } };

            expect(json.error.code).to.equal('throttled');
            expect(json.error.retry_after_seconds).to.equal(1);
            expect(fetchStub.callCount).to.equal(2);
        });

        it('exits 3 when the API refuses the token, and when it refuses the app', async () => {
            fetchStub = mockFetchSteps([
                {
                    body: { error_code: 'not_authenticated', errors: { non_field_errors: ['Authentication credentials were not provided.'] }, status_code: 403 },
                    status: 403,
                },
                {
                    body: { error_code: 'permission_denied', errors: { non_field_errors: ['You do not have permission to perform this action.'] }, status_code: 403 },
                    status: 403,
                },
            ]);

            const token = await runCommand(`analytics catalog ${APP}`);
            const app = await runCommand(`analytics funnel ${APP} ${PERIOD}`);

            expect(token.error?.oclif?.exit).to.equal(exitCode.auth);
            expect(token.error?.code).to.equal('not_authenticated');
            expect(app.error?.oclif?.exit).to.equal(exitCode.auth);
            expect(app.error?.code).to.equal('permission_denied');
            expect(app.error?.message).to.equal('You do not have permission to perform this action.');
        });

        it('exits 4 with malformed_response when a success is not the API envelope, instead of printing it', async () => {
            const cases = [
                { body: '<html>proxy</html>', command: `analytics funnel ${APP} ${PERIOD}` },
                { body: { data: { value: 3 } }, command: `analytics chart ${APP} ${PERIOD} --chart revenue` },
                { body: { error: 'none' }, command: `analytics catalog ${APP}` },
            ];

            for (const { body, command } of cases) {
                fetchStub = mockFetchSteps([{ body }]);

                const { error, stdout } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.api);
                expect(error?.code, command).to.equal('malformed_response');
                expect(stdout, command).to.equal('');

                restoreFetch(fetchStub);
                fetchStub = undefined;
            }
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
            expect(error?.message).to.equal('Invalid input:\n  --date-to: must not be before the start date');
            expect(fetchStub.callCount).to.equal(0);
        });
    });
});
