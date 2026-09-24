import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import { errorBody } from '../helpers/attribution-errors.js';
import { assertFetch, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

const BASE = 'https://api-ua.adapty.io/api/v1/cli';

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
        body: typeof init.body === 'string' ? init.body : undefined,
        headers: new Headers(init.headers),
        method: init.method,
        url,
    };
};

const PERIOD = '--date-from 2026-08-01 --date-to 2026-08-31';
const REPORT = `attribution report --app ${TEST_APP_ID} ${PERIOD} --metrics spend --group-by campaign`;

const reportAnswer = {
    data: {
        rows: [
            { campaign_id: '42', campaign_name: 'Summer', d7_roas: null, spend: 10.5 },
            { campaign_id: '43', campaign_name: null, d7_roas: 1.25, spend: 0 },
        ],
        totals: { d7_roas: null, spend: 10.5 },
    },
    meta: { query: { app_id: TEST_APP_ID, currency: 'USD' } },
    success: true,
};

const metricsAnswer = {
    data: {
        limits: {
            max_filter_values: 100,
            max_keyword_length: 256,
            max_metrics: 25,
            max_prediction_day: 365,
            max_prediction_horizons: 4,
            max_prediction_non_date_dimensions: 2,
            max_rows: 10_000,
            max_window_days: { day: 31, week: 180, month: 366, quarter: 366, year: 366, no_date_grouping: 92 },
        },
        metrics: [{
            additive: true,
            denominator: null,
            description: 'Ad spend in USD',
            example: null,
            family: 'spend',
            label: 'Spend',
            name: 'spend',
            pattern: null,
            spend_based: true,
            unit: 'usd',
        }, {
            additive: false,
            denominator: ['spend'],
            description: 'd{N}_revenue / Spend * 100.',
            example: 'd7_roas',
            family: 'cohort',
            label: 'ROAS by day N',
            name: 'd{N}_roas',
            pattern: 'd{N}_roas',
            spend_based: true,
            unit: 'percent',
        }],
    },
    meta: null,
    success: true,
};

const dimensionsAnswer = {
    data: {
        dimensions: [{
            filterable: true,
            granularities: ['day', 'week'],
            groupable: true,
            identity: 'value',
            label: 'Date',
            name: 'date',
        }],
    },
    meta: null,
    success: true,
};

const valuesAnswer = {
    data: { dimension: 'campaign', items: [{ channel: 'facebook', id: '42', name: 'Summer' }] },
    meta: { query: { app_id: TEST_APP_ID, dimension: 'campaign' } },
    success: true,
};

describe('attribution', () => {
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

    describe('report', () => {
        it('sends one POST with every flag translated, and --json prints the answer unchanged', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const { stdout } = await runCommand([
                'attribution', 'report',
                '--app', TEST_APP_ID,
                '--date-from', '2026-08-01',
                '--date-to', '2026-08-31',
                '--metrics', 'spend,d7_roas',
                '--metrics', 'installs',
                '--group-by', 'date,campaign',
                '--granularity', 'week',
                '--filter', 'country=US,GB',
                '--filter', 'channel=facebook',
                '--revenue-basis', 'proceeds',
                '--sort', 'spend:desc',
                '--json',
            ]);

            expect(JSON.parse(stdout)).to.deep.equal(reportAnswer);
            expect(fetchStub.callCount).to.equal(1);
            assertFetch({ base: BASE, callIndex: 0, method: 'POST', path: '/report', stub: fetchStub });

            const request = requestOf(fetchStub, 0);

            expect(request.headers.get('authorization')).to.equal('Bearer test-token');
            expect([...request.headers.keys()].filter(key => key.includes('app'))).to.deep.equal([]);

            expect(JSON.parse(request.body ?? '')).to.deep.equal({
                app_id: TEST_APP_ID,
                date_from: '2026-08-01',
                date_to: '2026-08-31',
                filters: [
                    { dimension: 'country', values: ['US', 'GB'] },
                    { dimension: 'channel', values: ['facebook'] },
                ],
                granularity: 'week',
                group_by: ['date', 'campaign'],
                metrics: ['spend', 'd7_roas', 'installs'],
                revenue_basis: 'proceeds',
                sort: { direction: 'desc', field: 'spend' },
            });
        });

        it('leaves optional fields to the backend and sorts ascending when no direction is given', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            await runCommand(`${REPORT} --sort spend --json`);

            expect(JSON.parse(requestOf(fetchStub, 0).body ?? '')).to.deep.equal({
                app_id: TEST_APP_ID,
                date_from: '2026-08-01',
                date_to: '2026-08-31',
                group_by: ['campaign'],
                metrics: ['spend'],
                sort: { direction: 'asc', field: 'spend' },
            });
        });

        it('keeps an escaped comma inside a --filter value', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            await runCommand([
                'attribution', 'report',
                '--app', TEST_APP_ID,
                '--date-from', '2026-08-01',
                '--date-to', '2026-08-31',
                '--metrics', 'spend',
                '--group-by', 'campaign',
                '--filter', String.raw`campaign=Q4\,Launch,Other`,
                '--json',
            ]);

            const { filters } = JSON.parse(requestOf(fetchStub, 0).body ?? '') as { filters: unknown };

            expect(filters).to.deep.equal([{ dimension: 'campaign', values: ['Q4,Launch', 'Other'] }]);
        });

        it('drops an empty segment of --metrics instead of sending an empty name', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            await runCommand(`attribution report --app ${TEST_APP_ID} ${PERIOD} --metrics spend,,installs --group-by campaign --json`);

            const { metrics } = JSON.parse(requestOf(fetchStub, 0).body ?? '') as { metrics: unknown };

            expect(metrics).to.deep.equal(['spend', 'installs']);
        });

        it('prints one labelled block per row and a totals block, with a dash for null and never 0', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const { stdout } = await runCommand(REPORT);

            expect(stdout).to.equal([
                'campaign_id: 42',
                'campaign_name: Summer',
                'd7_roas: —',
                'spend: 10.5',
                '---',
                'campaign_id: 43',
                'campaign_name: —',
                'd7_roas: 1.25',
                'spend: 0',
                '',
                'Totals',
                'd7_roas: —',
                'spend: 10.5',
                '',
            ].join('\n'));
        });

        it('exits 2 without a request when --date-to is missing', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const { error } = await runCommand(
                `attribution report --app ${TEST_APP_ID} --date-from 2026-08-01 --metrics spend --group-by campaign`,
            );

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('date-to');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 2 without a request for an app id that is not a uuid, with the published hint', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const { error } = await runCommand(
                `attribution report --app not-a-uuid ${PERIOD} --metrics spend --group-by campaign`,
            );

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('Invalid app ID format. Run `adapty apps list` to find your app ID.');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 2 without a request when --date-from is after --date-to, and names the flag', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const { error } = await runCommand(
                `attribution report --app ${TEST_APP_ID} --date-from 2026-09-01 --date-to 2026-08-31 --metrics spend --group-by campaign`,
            );

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('--date-to');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 2 without a request for malformed flag values', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const cases = [
                { command: `${REPORT} --filter country`, message: 'dimension=value' },
                { command: `${REPORT} --filter =US`, message: 'dimension=value' },
                { command: `${REPORT} --sort spend:up`, message: 'asc or desc' },
                { command: `attribution report --app ${TEST_APP_ID} --date-from 01.08.2026 --date-to 2026-08-31 --metrics spend --group-by campaign`, message: 'YYYY-MM-DD' },
                { command: `attribution report --app ${TEST_APP_ID} ${PERIOD} --metrics spend --group-by planet`, message: 'planet' },
                { command: `${REPORT} --granularity day`, message: '--granularity' },
                { command: `${REPORT} --revenue-basis net_net`, message: 'net_net' },
            ];

            for (const { command, message } of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
                expect(error?.message, command).to.contain(message);
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 2 without a request when --group-by date comes without --granularity, as the backend would refuse it', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const { error } = await runCommand(`attribution report --app ${TEST_APP_ID} ${PERIOD} --metrics spend --group-by date,campaign`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);

            expect(error?.message).to.contain(
                '--granularity: grouping by date requires exactly one granularity: day, week, month, quarter, year',
            );

            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 2 under --json too, naming the flag in the error object', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);
            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stdout } = await runCommand(`${REPORT} --filter country --json`);
            const exit = process.exitCode;

            process.exitCode = 0;

            const { error } = JSON.parse(stdout) as { error: { message: string } };

            expect(exit).to.equal(exitCode.usage);
            expect(error.message).to.contain('--filter');
            expect(error.message).to.contain('dimension=value');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('turns an unknown metric into exit 4 carrying the backend code in the --json error', async () => {
            const rejection = {
                body: errorBody('attribution_unknown_metric', 422, 'Unknown metric: d9000_roas', 'metrics'),
                status: 422,
            };

            fetchStub = mockFetchSteps([rejection]);

            const human = await runCommand(REPORT);

            expect(human.error?.oclif?.exit).to.equal(exitCode.api);
            expect(human.error?.message).to.equal('metrics: Unknown metric: d9000_roas');

            const { stdout } = await runCommand(`${REPORT} --json`);
            const { error } = JSON.parse(stdout) as { error: { code: string; status: number } };

            expect(error.code).to.equal('attribution_unknown_metric');
            expect(error.status).to.equal(422);
        });

        it('turns a company without attribution access into exit 4, without sending the user to log in', async () => {
            fetchStub = mockFetchSteps([{
                body: errorBody('attribution_access_required', 402, 'Attribution is not available on this plan'),
                status: 402,
            }]);

            const { error } = await runCommand(REPORT);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.code).to.equal('attribution_access_required');
            expect(error?.message).to.not.contain('auth login');
        });

        it('exits 4 on a busy backend after exactly one request, and hands the wait to --json', async () => {
            const busy = {
                body: errorBody('attribution_busy', 429, 'Another query is running'),
                headers: { 'retry-after': '5' },
                status: 429,
            };

            fetchStub = mockFetchSteps([busy, busy, { body: reportAnswer }]);

            const { error } = await runCommand(REPORT);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.code).to.equal('attribution_busy');
            expect(fetchStub.callCount).to.equal(1);

            const { stdout } = await runCommand(`${REPORT} --json`);
            const json = JSON.parse(stdout) as { error: { error_code: string; retry_after_seconds?: number } };

            expect(json.error.error_code).to.equal('attribution_busy');
            expect(json.error.retry_after_seconds).to.equal(5);
            expect(fetchStub.callCount).to.equal(2);
        });

        it('exits 3 when the backend refuses the token', async () => {
            fetchStub = mockFetchSteps([{ body: errorBody('attribution_token_invalid', 401, 'Invalid token'), status: 401 }]);

            const { error } = await runCommand(REPORT);

            expect(error?.oclif?.exit).to.equal(exitCode.auth);
        });

        it('exits 4 after one request when the app is not found', async () => {
            fetchStub = mockFetchSteps([{
                body: errorBody('attribution_app_not_found', 404, 'App not found'),
                status: 404,
            }]);

            const { error } = await runCommand(REPORT);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.code).to.equal('attribution_app_not_found');
            expect(fetchStub.callCount).to.equal(1);
        });

        it('exits 5 after one attempt when the backend cannot be reached, with network_error under --json', async () => {
            fetchStub = sinon.stub(globalThis, 'fetch').rejects(new TypeError('fetch failed'));
            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stdout } = await runCommand(`${REPORT} --json`);
            const exit = process.exitCode;

            process.exitCode = 0;

            const { error } = JSON.parse(stdout) as { error: { code: string } };

            expect(exit).to.equal(exitCode.network);
            expect(error.code).to.equal('network_error');
            expect(fetchStub.callCount).to.equal(1);
        });
    });

    describe('without a token', () => {
        beforeEach(() => {
            delete process.env.ADAPTY_TOKEN;
        });

        it('exits 3 before any request once the flags are valid', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const commands = [
                REPORT,
                `attribution values --app ${TEST_APP_ID} ${PERIOD} --dimension country`,
                'attribution metrics',
                'attribution dimensions',
            ];

            for (const command of commands) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.auth);
                expect(error?.message, command).to.contain('Not authenticated');
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('reports bad input first, not the missing token', async () => {
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const { error } = await runCommand(
                `attribution report --app ${TEST_APP_ID} --date-from 2026-09-01 --date-to 2026-08-31 --metrics spend --group-by campaign`,
            );

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.not.contain('Not authenticated');
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('base URL', () => {
        it('goes to ADAPTY_ATTRIBUTION_API_URL and warns about it on stderr only', async () => {
            process.env.ADAPTY_ATTRIBUTION_API_URL = 'https://ua.staging.example.com/api/v1/cli';
            fetchStub = mockFetchSteps([{ body: reportAnswer }]);

            const { stderr, stdout } = await runCommand(`${REPORT} --json`);

            assertFetch({ base: 'https://ua.staging.example.com/api/v1/cli', callIndex: 0, method: 'POST', path: '/report', stub: fetchStub });
            expect(stderr).to.contain('Warning: Using non-default attribution API URL: https://ua.staging.example.com/api/v1/cli');
            expect(stderr).to.not.contain('non-default API URL');
            expect(JSON.parse(stdout)).to.deep.equal(reportAnswer);
        });

        it('stays on the attribution default, silently, when only ADAPTY_API_URL is redirected', async () => {
            process.env.ADAPTY_API_URL = 'https://staging.example.com/api/v1/developer';
            fetchStub = mockFetchSteps([{ body: metricsAnswer }]);

            const { stderr } = await runCommand('attribution metrics --json');

            assertFetch({ base: BASE, callIndex: 0, method: 'GET', path: '/metrics', stub: fetchStub });
            expect(stderr).to.not.contain('Warning');
        });
    });

    describe('catalog', () => {
        it('reads metrics and dimensions with GETs that carry no app id', async () => {
            const stub = mockFetchSteps([{ body: metricsAnswer }, { body: dimensionsAnswer }]);

            fetchStub = stub;

            const metrics = await runCommand('attribution metrics --json');
            const dimensions = await runCommand('attribution dimensions --json');

            expect(JSON.parse(metrics.stdout)).to.deep.equal(metricsAnswer);
            expect(JSON.parse(dimensions.stdout)).to.deep.equal(dimensionsAnswer);

            for (const index of [0, 1]) {
                const request = requestOf(stub, index);

                expect(request.body).to.equal(undefined);
                expect(request.url).to.not.contain(TEST_APP_ID);
                expect(request.url).to.not.contain('?');
                expect([...request.headers.keys()].filter(key => key.includes('app'))).to.deep.equal([]);
            }

            assertFetch({ base: BASE, callIndex: 0, method: 'GET', path: '/metrics', stub });
            assertFetch({ base: BASE, callIndex: 1, method: 'GET', path: '/dimensions', stub });
        });

        it('prints the catalogs for a human reader: traits, limits, and what a dimension filters by', async () => {
            fetchStub = mockFetchSteps([{ body: metricsAnswer }, { body: dimensionsAnswer }]);

            const metrics = await runCommand('attribution metrics');
            const dimensions = await runCommand('attribution dimensions');

            expect(metrics.stdout).to.equal([
                'spend (usd, spend_based)',
                '  Spend: Ad spend in USD',
                'd{N}_roas (percent, spend_based, denominator spend) — pattern d{N}_roas, e.g. d7_roas',
                '  ROAS by day N: d{N}_revenue / Spend * 100.',
                '',
                'Limits: 25 metrics, 100 values per filter, 256 characters per keyword, 10000 rows',
                '  Widest period in days: day 31, week 180, month 366, quarter 366, year 366, no date grouping 92',
                '  Predictions: 4 horizons, day 365 at most, 2 dimensions besides date',
                '',
            ].join('\n'));

            expect(dimensions.stdout).to.equal('date: Date (group, filter; identity value; granularities day, week)\n');
        });

        it('describes a metric family by its pattern and example, and a ratio by every metric it divides by', async () => {
            const arpas = {
                additive: false,
                denominator: ['d{N}_count_subscription_started', 'd{N}_count_trial_started'],
                description: 'd{N}_revenue / (subscriptions started + trials started), in USD.',
                example: 'd7_arpas',
                family: 'cohort',
                label: 'ARPAS by day N',
                name: 'd{N}_arpas',
                pattern: 'd{N}_arpas',
                spend_based: false,
                unit: 'usd',
            };

            const answer = { ...metricsAnswer, data: { ...metricsAnswer.data, metrics: [arpas] } };

            fetchStub = mockFetchSteps([{ body: answer }]);

            const { stdout } = await runCommand('attribution metrics');

            expect(stdout.split('\n').slice(0, 2)).to.deep.equal([
                'd{N}_arpas (usd, denominator d{N}_count_subscription_started + d{N}_count_trial_started) — pattern d{N}_arpas, e.g. d7_arpas',
                '  ARPAS by day N: d{N}_revenue / (subscriptions started + trials started), in USD.',
            ]);
        });
    });

    describe('values', () => {
        it('sends one POST with the dimension and period, and --json prints the answer unchanged', async () => {
            fetchStub = mockFetchSteps([{ body: valuesAnswer }]);

            const { stdout } = await runCommand(
                `attribution values --app ${TEST_APP_ID} ${PERIOD} --dimension campaign --revenue-basis net --json`,
            );

            expect(JSON.parse(stdout)).to.deep.equal(valuesAnswer);
            assertFetch({ base: BASE, callIndex: 0, method: 'POST', path: '/values', stub: fetchStub });

            expect(JSON.parse(requestOf(fetchStub, 0).body ?? '')).to.deep.equal({
                app_id: TEST_APP_ID,
                date_from: '2026-08-01',
                date_to: '2026-08-31',
                dimension: 'campaign',
                revenue_basis: 'net',
            });
        });

        it('prints the items for a human reader', async () => {
            fetchStub = mockFetchSteps([{ body: valuesAnswer }]);

            const { stdout } = await runCommand(`attribution values --app ${TEST_APP_ID} ${PERIOD} --dimension campaign`);

            expect(stdout).to.contain('Summer');
            expect(stdout).to.contain('42');
            expect(stdout).to.contain('facebook');
        });

        it('prints value items as they are, and a dash where the backend has no value or channel', async () => {
            fetchStub = mockFetchSteps([
                { body: { data: { dimension: 'country', items: [{ value: 'US' }, { value: null }] }, meta: { query: {} }, success: true } },
                { body: { data: { dimension: 'campaign', items: [{ channel: null, id: null, name: null }] }, meta: { query: {} }, success: true } },
            ]);

            const countries = await runCommand(`attribution values --app ${TEST_APP_ID} ${PERIOD} --dimension country`);

            expect(countries.stdout.split('\n').filter(line => line !== '')).to.deep.equal(['US', '—']);

            const campaigns = await runCommand(`attribution values --app ${TEST_APP_ID} ${PERIOD} --dimension campaign`);

            expect(campaigns.stdout).to.contain('— (—, id —)');
            expect(campaigns.stdout).to.not.contain('null');
        });

        it('exits 2 without a request when --dimension or --app is missing', async () => {
            fetchStub = mockFetchSteps([{ body: valuesAnswer }]);

            for (const command of [
                `attribution values --app ${TEST_APP_ID} ${PERIOD}`,
                `attribution values ${PERIOD} --dimension country`,
            ]) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
            }

            expect(fetchStub.callCount).to.equal(0);
        });
    });
});
