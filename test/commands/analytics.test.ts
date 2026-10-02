import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import { revenueByCountry } from '../fixtures/analytics-chart.js';
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

const bodyOf = (stub: sinon.SinonStub, callIndex: number): unknown => {
    const [, init] = stub.getCall(callIndex).args as [string, RequestInit];

    return typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
};

const PERIOD = '--date-from 2026-09-01 --date-to 2026-09-28';
const CHART = `analytics chart revenue --app ${TEST_APP_ID} ${PERIOD}`;

const catalogAnswer = {
    data: {
        charts: [
            {
                chart_id: 'revenue',
                filters: ['store', 'country'],
                revenue_basis: true,
                segmentations: ['country', 'store'],
                title: 'Revenue',
                unit: 'USD',
            },
            { chart_id: 'installs', filters: ['country'], revenue_basis: false, segmentations: [], title: 'Installs' },
        ],
        dimensions: [
            { filter: true, key: 'country', segmentation: true, title: 'Country' },
            { filter: true, key: 'segment_id', segmentation: false, title: 'Segment' },
        ],
        period_units: ['day', 'week', 'month', 'quarter', 'year'],
        revenue_bases: ['gross', 'proceeds', 'net'],
    },
};

const valuesAnswer = {
    data: [
        { group: 'North America', label: 'United States', value: 'US' },
        { label: 'play_store', value: 'play_store' },
    ],
};

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
        delete process.env.ADAPTY_ATTRIBUTION_API_URL;
    });

    describe('chart', () => {
        it('sends one POST with every flag translated, and --json prints the answer unchanged', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            const { stdout } = await runCommand([
                'analytics', 'chart', 'revenue',
                '--app', TEST_APP_ID,
                '--date-from', '2026-09-01',
                '--date-to', '2026-09-28',
                '--granularity', 'week',
                '--segment-by', 'country',
                '--filter', 'store=play_store',
                '--filter', 'country=US,DE',
                '--revenue-basis', 'gross',
                '--json',
            ]);

            expect(JSON.parse(stdout)).to.deep.equal(revenueByCountry);
            expect(fetchStub.callCount).to.equal(1);
            assertFetch({ callIndex: 0, method: 'POST', path: `/apps/${TEST_APP_ID}/analytics/metrics/`, stub: fetchStub });

            expect(bodyOf(fetchStub, 0)).to.deep.equal({
                chart_id: 'revenue',
                filters: { country: ['US', 'DE'], date: ['2026-09-01', '2026-09-28'], store: ['play_store'] },
                period_unit: 'week',
                revenue_basis: 'gross',
                segmentation: 'country',
            });
        });

        it('sends only the chart and the period when no optional flag is given', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            await runCommand(`${CHART} --json`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({ chart_id: 'revenue', filters: { date: ['2026-09-01', '2026-09-28'] } });
        });

        it('keeps an escaped comma inside a --filter value', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            await runCommand([...CHART.split(' '), '--filter', String.raw`store_product_id=pro\,annual,basic`, '--json']);

            expect(bodyOf(fetchStub, 0)).to.have.nested.property('filters.store_product_id').deep.equal(['pro,annual', 'basic']);
        });

        it('goes to ADAPTY_API_URL, the developer API, and not to the attribution host', async () => {
            process.env.ADAPTY_API_URL = 'https://stand.example.com/api/v1/developer';
            process.env.ADAPTY_ATTRIBUTION_API_URL = 'https://ua.example.com/api/v1/cli';
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            await runCommand(`${CHART} --json`);

            assertFetch({
                base: 'https://stand.example.com/api/v1/developer',
                callIndex: 0,
                method: 'POST',
                path: `/apps/${TEST_APP_ID}/analytics/metrics/`,
                stub: fetchStub,
            });
        });

        it('prints the chart as an aligned table, with a dash for null and never 0', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            const { stdout } = await runCommand(CHART);

            expect(stdout).to.equal([
                'Revenue, gross, USD',
                '2026-09-01 – 2026-09-28, week, timezone Europe/Berlin',
                '',
                '          Total  2026-09-01  2026-09-08  2026-09-15  2026-09-22',
                'Total  48210.40    11902.10    12340.00    11655.30    12313.00',
                'US     21004.00     5120.00     5480.20     5101.80     5302.00',
                'DE            —           —        0.00       12.50           —',
                '',
            ].join('\n'));
        });

        it('prints CSV to stdout with --csv', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            const { stdout } = await runCommand(`${CHART} --csv`);

            expect(stdout.split('\n')[0]).to.equal('segment,total,2026-09-01,2026-09-08,2026-09-15,2026-09-22');
            expect(stdout.split('\n')[3]).to.equal('DE,,,0,12.5,');
        });

        it('refuses --csv together with --json without a request', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stdout } = await runCommand(`${CHART} --csv --json`);

            process.exitCode = 0;

            const { error } = JSON.parse(stdout) as { error: { message: string } };

            expect(error.message).to.contain('cannot also be provided when using --csv');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 2 without a request for malformed or missing input, naming the flag', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            const cases = [
                { command: `analytics chart revenue --app ${TEST_APP_ID} --date-from 2026-09-01`, message: 'date-to' },
                { command: `analytics chart revenue --app not-a-uuid ${PERIOD}`, message: 'Invalid app ID format' },
                { command: `analytics chart revenue --app ${TEST_APP_ID} --date-from 2026-09-30 --date-to 2026-09-01`, message: '--date-to' },
                { command: `analytics chart revenue --app ${TEST_APP_ID} --date-from 2026-02-30 --date-to 2026-03-01`, message: '--date-from' },
                { command: `analytics chart revenue --app ${TEST_APP_ID} --date-from 01.09.2026 --date-to 2026-09-28`, message: 'YYYY-MM-DD' },
                { command: `analytics chart --app ${TEST_APP_ID} ${PERIOD}`, message: 'chart-id' },
                { command: `${CHART} --granularity hour`, message: 'hour' },
                { command: `${CHART} --revenue-basis net_net`, message: 'net_net' },
                { command: `${CHART} --filter country`, message: 'dimension=value' },
                { command: `${CHART} --filter =US`, message: 'dimension=value' },
                { command: `${CHART} --filter country=US --filter country=DE`, message: '--filter: country is given twice' },
                { command: `${CHART} --filter date=2026-09-01`, message: '--date-from and --date-to' },
            ];

            for (const { command, message } of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
                expect(error?.message, command).to.contain(message);
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('turns a server 400 into exit 4 with the server message, and the code under --json', async () => {
            const refused = {
                body: {
                    error_code: 'validation_error',
                    errors: { segmentation: ['paywall_id is not allowed for installs; allowed: country, store'] },
                },
                status: 400,
            };

            fetchStub = mockFetchSteps([refused]);

            const human = await runCommand(`analytics chart installs --app ${TEST_APP_ID} ${PERIOD} --segment-by paywall_id`);

            expect(human.error?.oclif?.exit).to.equal(exitCode.api);
            expect(human.error?.message).to.equal('segmentation: paywall_id is not allowed for installs; allowed: country, store');

            const { stdout } = await runCommand(`analytics chart installs --app ${TEST_APP_ID} ${PERIOD} --segment-by paywall_id --json`);
            const { error } = JSON.parse(stdout) as { error: { code: string; status: number } };

            expect(error.code).to.equal('validation_error');
            expect(error.status).to.equal(400);
        });

        it('exits 4 on a 429 after exactly one request, and hands the wait to --json', async () => {
            const busy = {
                body: { error_code: 'throttled', errors: { non_field_errors: ['Request was throttled.'] } },
                headers: { 'retry-after': '1' },
                status: 429,
            };

            fetchStub = mockFetchSteps([busy, busy, { body: revenueByCountry }]);

            const { error } = await runCommand(CHART);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(fetchStub.callCount).to.equal(1);

            const { stdout } = await runCommand(`${CHART} --json`);
            const json = JSON.parse(stdout) as { error: { retry_after_seconds?: number } };

            expect(json.error.retry_after_seconds).to.equal(1);
            expect(fetchStub.callCount).to.equal(2);
        });
    });

    describe('catalog', () => {
        it('reads charts and dimensions from the same app route, and --json prints the answer unchanged', async () => {
            fetchStub = mockFetchSteps([{ body: catalogAnswer }, { body: catalogAnswer }]);

            const charts = await runCommand(`analytics charts --app ${TEST_APP_ID} --json`);
            const dimensions = await runCommand(`analytics dimensions --app ${TEST_APP_ID} --json`);

            expect(JSON.parse(charts.stdout)).to.deep.equal(catalogAnswer);
            expect(JSON.parse(dimensions.stdout)).to.deep.equal(catalogAnswer);
            assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/analytics/catalog/`, stub: fetchStub });
            assertFetch({ callIndex: 1, method: 'GET', path: `/apps/${TEST_APP_ID}/analytics/catalog/`, stub: fetchStub });
        });

        it('prints the charts with what each one accepts, and the dimensions with their uses', async () => {
            fetchStub = mockFetchSteps([{ body: catalogAnswer }, { body: catalogAnswer }]);

            const charts = await runCommand(`analytics charts --app ${TEST_APP_ID}`);
            const dimensions = await runCommand(`analytics dimensions --app ${TEST_APP_ID}`);

            expect(charts.stdout).to.equal([
                'revenue: Revenue (USD, revenue_basis)',
                '  segmentations: country, store',
                '  filters: store, country',
                'installs: Installs',
                '  segmentations: none',
                '  filters: country',
                '',
                'Granularities: day, week, month, quarter, year',
                'Revenue bases: gross, proceeds, net',
                '',
            ].join('\n'));

            expect(dimensions.stdout).to.equal('country: Country (filter, segment)\nsegment_id: Segment (filter)\n');
        });

        it('exits 2 without a request when --app is missing', async () => {
            fetchStub = mockFetchSteps([{ body: catalogAnswer }]);

            for (const command of ['analytics charts', 'analytics dimensions']) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
            }

            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('values', () => {
        it('sends the dimension as a query parameter, and --json prints the answer unchanged', async () => {
            fetchStub = mockFetchSteps([{ body: valuesAnswer }]);

            const { stdout } = await runCommand(`analytics values country --app ${TEST_APP_ID} --json`);

            expect(JSON.parse(stdout)).to.deep.equal(valuesAnswer);

            assertFetch({
                callIndex: 0,
                method: 'GET',
                path: `/apps/${TEST_APP_ID}/analytics/values/`,
                query: { dimension: 'country' },
                stub: fetchStub,
            });
        });

        it('prints the value first, then the label when it differs, then the group', async () => {
            fetchStub = mockFetchSteps([{ body: valuesAnswer }, { body: { data: [] } }]);

            const { stdout } = await runCommand(`analytics values country --app ${TEST_APP_ID}`);

            expect(stdout).to.equal('US United States (North America)\nplay_store\n');

            const empty = await runCommand(`analytics values offer_id --app ${TEST_APP_ID}`);

            expect(empty.stdout).to.equal('No offer_id values in this app.\n');
        });

        it('exits 2 without a request when the dimension or --app is missing', async () => {
            fetchStub = mockFetchSteps([{ body: valuesAnswer }]);

            for (const command of [`analytics values --app ${TEST_APP_ID}`, 'analytics values country']) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
            }

            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('without a token', () => {
        beforeEach(() => {
            delete process.env.ADAPTY_TOKEN;
        });

        it('exits 3 before any request once the input is valid', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            for (const command of [
                CHART,
                `analytics charts --app ${TEST_APP_ID}`,
                `analytics dimensions --app ${TEST_APP_ID}`,
                `analytics values country --app ${TEST_APP_ID}`,
            ]) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.auth);
                expect(error?.message, command).to.contain('Not authenticated');
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('reports bad input first, not the missing token', async () => {
            fetchStub = mockFetchSteps([{ body: revenueByCountry }]);

            const { error } = await runCommand(`${CHART} --filter country=US --filter country=DE`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.not.contain('Not authenticated');
            expect(fetchStub.callCount).to.equal(0);
        });
    });
});
