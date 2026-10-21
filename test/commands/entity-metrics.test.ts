import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { mockFetch, mockFetchFailure, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

import type { FilterValueNode, FilterValues, MetricsNode } from '../../src/sdk/adapty/index.js';
import type * as sinon from 'sinon';

const BASE = 'https://api-admin.adapty.io/api/v1/developer';
const FLOW_ID = '0b0c7e9e-3c06-4f7a-9d7e-2f2f6d3c1b11';
const OTHER_FLOW_ID = '1c1d8f0f-4d17-4a8b-8e8f-3a3a7e4d2c22';
const PLACEMENT_ID = '2d2e9a1a-5e28-4b9c-9f9a-4b4b8f5e3d33';
const OTHER_PLACEMENT_ID = '3e3f0b2b-6f39-4cad-a0ab-5c5c9a6f4e44';

/** The 27 metrics in the order the server sends them: what a CSV header must say, written out on purpose. */
const METRICS = [
    'views', 'unique_profiles_views', 'total_completions', 'total_uniq_completions', 'from_start_conversion',
    'revenue', 'proceeds', 'net_revenue', 'purchases', 'trials', 'unique_subscribers', 'unique_paid_subscribers',
    'arppu', 'arpu', 'conversion_rate_purchases', 'conversion_rate_trials', 'trials_cancelled', 'refunds', 'arpas',
    'apppu', 'appas', 'conversion_rate_refunds', 'conversion_rate_purchases_by_users', 'conversion_rate_trials_by_users',
    'conversion_rate_trial_paid', 'trials_finished', 'trials_paid',
];

/** The 27 metrics, all 0 as the server answers for "no data", with the few that a test looks at. */
const node = (fields: Record<string, unknown>): MetricsNode =>
    ({ ...Object.fromEntries(METRICS.map(name => [name, 0])), ...fields }) as MetricsNode;

const period = (day: string, views: number, revenue: number): MetricsNode =>
    node({ level: 'period', period: `${day}T00:00:00Z`, revenue, views });

// The flow tree of the dashboard, cut down: the root has no level, a placement carries its periods
const FLOW_TREE = {
    data: node({
        items: [
            node({
                items: [node({
                    items: [node({
                        content_type: 'flow',
                        items: [node({ level: 'screen', position: 1, screen_id: 'screen_main', title: '1. Main', views: 10 })],
                        level: 'variation',
                        purchases: 7,
                        revenue: 241.93,
                        title: 'Variant, "A"',
                        views: 10,
                    })],
                    level: 'audience',
                    purchases: 7,
                    revenue: 241.93,
                    title: 'All Users',
                    views: 10,
                })],
                level: 'placement',
                purchases: 7,
                revenue: 241.93,
                title: 'Onboarding',
                trials: 0,
                values: [period('2026-09-01', 0, 0), period('2026-10-01', 10, 241.93)],
                views: 10,
            }),
            node({ level: 'placement', revenue: 0, title: 'Settings', views: 0 }),
        ],
        purchases: 7,
        revenue: 241.93,
        title: FLOW_ID,
        trials: 4,
        views: 19,
    }),
};

const PLACEMENT_TREE = {
    data: node({
        items: [
            node({ flow_id: FLOW_ID, level: 'flow', purchases: 7, revenue: 226.95, title: 'Welcome flow', trials: 4, views: 9 }),
            node({ flow_id: OTHER_FLOW_ID, level: 'flow', purchases: 1, revenue: 9.99, title: 'Promo flow', views: 4 }),
        ],
        level: 'root',
        placement_id: PLACEMENT_ID,
        purchases: 8,
        revenue: 236.94,
        title: 'Main placement',
        trials: 4,
        values: [],
        views: 13,
    }),
};

// A flow placement by audience and country: audience, variation, then the country segments
const PLACEMENT_BY_AUDIENCE = {
    data: node({
        items: [node({
            items: [node({
                items: [
                    node({ level: 'segment', segmentation: 'SE', title: 'Sweden', views: 3 }),
                    node({ level: 'segment', segmentation: 'US', title: 'United States', purchases: 1, revenue: 9.99, views: 1 }),
                ],
                level: 'variation',
                purchases: 1,
                revenue: 9.99,
                title: 'Variant B',
                views: 4,
            })],
            level: 'audience',
            purchases: 1,
            revenue: 9.99,
            title: 'All Users',
            views: 4,
        })],
        level: 'root',
        placement_id: PLACEMENT_ID,
        purchases: 1,
        revenue: 9.99,
        title: 'Main placement',
        values: [],
        views: 4,
    }),
};

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

const leaves = (nodes: readonly FilterValueNode[], key = ''): [string, string][] =>
    nodes.flatMap(item => (item.children === undefined
        ? [[key, item.value] as [string, string]]
        : leaves(item.children, key === '' ? item.value : key)));

describe('flows metrics and placements metrics', () => {
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

    const FLOW_GET = `flows metrics get ${FLOW_ID} --app ${TEST_APP_ID}`;
    const PLACEMENT_GET = `placements metrics get ${PLACEMENT_ID} --app ${TEST_APP_ID} --type flow`;
    const url = (call: Call): string => call.url.origin + call.url.pathname;

    describe('flows metrics get', () => {
        it('sends every flag as the dashboard does, and --json prints the answer unchanged', async () => {
            fetchStub = mockFetch([FLOW_TREE]);

            const { stdout } = await runCommand([
                ...FLOW_GET.split(' '),
                '--date-from', '2026-09-01',
                '--date-to', '2026-10-21',
                '--based-on', 'placement',
                '--granularity', 'month',
                '--date-type', 'purchase_date',
                '--filter', 'country=US,DE',
                '--filter', 'store=app_store',
                '--timezone', 'Europe/Berlin',
                '--json',
            ]);

            expect(JSON.parse(stdout)).to.deep.equal(FLOW_TREE);

            const call = callOf(fetchStub);

            expect(call.method).to.equal('POST');
            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/flows/${FLOW_ID}/metrics/`);
            expect(call.url.search).to.equal('');
            expect(call.headers.get('adapty-tz')).to.equal('Europe/Berlin');
            expect(call.headers.get('authorization')).to.equal('Bearer test-token');

            expect(call.body).to.deep.equal({
                based_on: 'placement',
                date_type: 'purchase_date',
                filters: { country: ['US', 'DE'], date: ['2026-09-01', '2026-10-21'], store: ['app_store'] },
                period_unit: 'month',
            });
        });

        it('--filter takes a list, the same key twice, and an escaped comma inside a value', async () => {
            fetchStub = mockFetch([FLOW_TREE]);

            await runCommand([
                ...FLOW_GET.split(' '),
                '--filter', 'country=US',
                '--filter', 'country=DE',
                '--filter', String.raw`attribution_campaign=Q4\,Launch,Other`,
                '--filter', 'attribution_channel=',
                '--json',
            ]);

            expect((callOf(fetchStub).body as { filters: unknown }).filters).to.deep.equal({
                attribution_campaign: ['Q4,Launch', 'Other'],
                attribution_channel: [''],
                country: ['US', 'DE'],
            });
        });

        it('sends only what was given: no body keys and no time zone header by default', async () => {
            fetchStub = mockFetch([FLOW_TREE]);

            await runCommand(`${FLOW_GET} --json`);

            const call = callOf(fetchStub);

            expect(call.body).to.deep.equal({});
            expect(call.headers.has('adapty-tz')).to.equal(false);
        });

        it('sends a value it cannot judge, and the answer of the server is the error (exit 4)', async () => {
            fetchStub = mockFetchFailure(
                {
                    error_code: 'validation_error',
                    errors: { based_on: ['"paywall" is not valid: use placement or audience'] },
                    status_code: 400,
                },
                { status: 400 },
            );

            const { error } = await runCommand(`${FLOW_GET} --based-on paywall --date-type shown_at --granularity decade`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.contain('based_on: "paywall" is not valid: use placement or audience');
            expect(callOf(fetchStub).body).to.deep.equal({ based_on: 'paywall', date_type: 'shown_at', period_unit: 'decade' });
        });

        it('exits 4 with the server text for a flow of another app (404)', async () => {
            fetchStub = mockFetchFailure(
                { error_code: 'not_found', errors: { non_field_errors: ['Flow not found.'] }, status_code: 404 },
                { status: 404 },
            );

            const { error } = await runCommand(FLOW_GET);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.contain('Flow not found.');
        });

        it('prints Total first and the first level under it, with the numbers aligned and the periods of a node under it', async () => {
            fetchStub = mockFetch([FLOW_TREE]);

            const { stdout } = await runCommand(FLOW_GET);

            expect(stdout).to.equal([
                'Total           views 19  purchases 7  trials 4  revenue 241.93',
                '  Onboarding    views 10  purchases 7  trials 0  revenue 241.93',
                '    2026-09-01  views  0  purchases 0  trials 0  revenue   0.00',
                '    2026-10-01  views 10  purchases 0  trials 0  revenue 241.93',
                '  Settings      views  0  purchases 0  trials 0  revenue   0.00',
                '',
            ].join('\n'));
        });

        it('with --depth prints deeper levels, and the period points right under their node', async () => {
            fetchStub = mockFetch([FLOW_TREE]);

            const { stdout } = await runCommand(`${FLOW_GET} --depth 3`);

            expect(stdout).to.equal([
                'Total               views 19  purchases 7  trials 4  revenue 241.93',
                '  Onboarding        views 10  purchases 7  trials 0  revenue 241.93',
                '    2026-09-01      views  0  purchases 0  trials 0  revenue   0.00',
                '    2026-10-01      views 10  purchases 0  trials 0  revenue 241.93',
                '    All Users       views 10  purchases 7  trials 0  revenue 241.93',
                '      Variant, "A"  views 10  purchases 7  trials 0  revenue 241.93',
                '  Settings          views  0  purchases 0  trials 0  revenue   0.00',
                '',
            ].join('\n'));
        });

        it('--csv has one row for each node of the whole tree, the 27 metrics, and quotes what needs it', async () => {
            fetchStub = mockFetch([FLOW_TREE]);

            const { stdout } = await runCommand(`${FLOW_GET} --csv`);
            const lines = stdout.trimEnd().split('\n');

            expect(lines[0]).to.equal(`path,level,title,${METRICS.join(',')}`);
            // the header, then Total, a placement, its 2 periods, audience, variation, screen, and the other placement
            expect(lines).to.have.length(1 + 1 + 1 + 2 + 1 + 1 + 1 + 1);

            // views, 4 more, revenue, 2 more, purchases, trials, then 17 zeros
            expect(lines[1]).to.equal(`Total,root,Total,19,0,0,0,0,241.93,0,0,7,4,${Array.from({ length: 17 }, () => '0').join(',')}`);
            expect(lines[2]?.startsWith('Total > Onboarding,placement,Onboarding,10,')).to.equal(true);
            expect(lines[3]?.startsWith('Total > Onboarding > 2026-09-01,period,2026-09-01,0,')).to.equal(true);
            expect(lines[5]?.startsWith('Total > Onboarding > All Users,audience,All Users,')).to.equal(true);

            // a comma or a quote in a title: the cell is quoted and the quote doubled
            expect(lines[6]?.startsWith('"Total > Onboarding > All Users > Variant, ""A""",variation,"Variant, ""A""",10,')).to.equal(true);
            expect(lines[7]?.startsWith('"Total > Onboarding > All Users > Variant, ""A"" > 1. Main",screen,1. Main,10,')).to.equal(true);
            expect(lines[8]?.startsWith('Total > Settings,placement,Settings,0,')).to.equal(true);
        });

        it('exits 2 for a half period, a bad date, a bad filter and a bad depth, before any request and without a token', async () => {
            fetchStub = mockFetch([FLOW_TREE]);
            delete process.env.ADAPTY_TOKEN;

            const cases: [string, string][] = [
                ['--date-from 2026-09-01', 'both ends'],
                ['--date-to 2026-09-01', 'both ends'],
                ['--date-from 2026-9-1 --date-to 2026-09-01', 'YYYY-MM-DD'],
                ['--filter country', 'key=value'],
                ['--depth 0', 'depth'],
            ];

            for (const [flags, text] of cases) {
                const { error } = await runCommand(`${FLOW_GET} ${flags}`);

                expect(error?.oclif?.exit, flags).to.equal(exitCode.usage);
                expect(error?.message, flags).to.contain(text);
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('refuses --csv together with --json: exit 2, an error in the JSON that was asked for, no request', async () => {
            fetchStub = mockFetch([FLOW_TREE]);
            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stdout } = await runCommand(`${FLOW_GET} --csv --json`);
            const exit = process.exitCode;

            process.exitCode = 0;

            expect(exit).to.equal(exitCode.usage);
            expect((JSON.parse(stdout) as { error: { message: string } }).error.message).to.contain('--json=true cannot also be provided when using --csv');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('with --depth 2 prints the second level and no more, and --depth 0 is refused', async () => {
            fetchStub = mockFetch([FLOW_TREE]);

            const { stdout } = await runCommand(`${FLOW_GET} --depth 2`);

            expect(stdout).to.equal([
                'Total           views 19  purchases 7  trials 4  revenue 241.93',
                '  Onboarding    views 10  purchases 7  trials 0  revenue 241.93',
                '    2026-09-01  views  0  purchases 0  trials 0  revenue   0.00',
                '    2026-10-01  views 10  purchases 0  trials 0  revenue 241.93',
                '    All Users   views 10  purchases 7  trials 0  revenue 241.93',
                '  Settings      views  0  purchases 0  trials 0  revenue   0.00',
                '',
            ].join('\n'));
        });

        it('exits 2 for an id that is not a UUID', async () => {
            fetchStub = mockFetch([FLOW_TREE]);

            const { error } = await runCommand(`flows metrics get not-a-uuid --app ${TEST_APP_ID}`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 3 without a token', async () => {
            fetchStub = mockFetch([FLOW_TREE]);
            delete process.env.ADAPTY_TOKEN;

            const { error } = await runCommand(FLOW_GET);

            expect(error?.oclif?.exit).to.equal(exitCode.auth);
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('placements metrics get', () => {
        it('sends the type as a query value and every flag in the body, --group-by as segmentation_by', async () => {
            fetchStub = mockFetch([PLACEMENT_TREE]);

            const { stdout } = await runCommand([
                ...PLACEMENT_GET.split(' '),
                '--date-from', '2026-09-01',
                '--date-to', '2026-10-21',
                '--date-type', 'profile_install_date',
                '--based-on', 'audience',
                '--group-by', 'country',
                '--granularity', 'week',
                '--filter', 'store=play_store',
                '--json',
            ]);

            expect(JSON.parse(stdout)).to.deep.equal(PLACEMENT_TREE);

            const call = callOf(fetchStub);

            expect(call.method).to.equal('POST');
            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/placements/${PLACEMENT_ID}/metrics/`);
            expect(call.url.search).to.equal('?type=flow');

            expect(call.body).to.deep.equal({
                based_on: 'audience',
                date_type: 'profile_install_date',
                filters: { date: ['2026-09-01', '2026-10-21'], store: ['play_store'] },
                period_unit: 'week',
                segmentation_by: 'country',
            });
        });

        it('sends a type and a grouping it cannot judge, and the server text is the error (exit 4)', async () => {
            fetchStub = mockFetchFailure(
                {
                    error_code: 'validation_error',
                    errors: { type: ['The placement is of type paywall, not flow.'] },
                    status_code: 400,
                },
                { status: 400 },
            );

            const { error } = await runCommand(
                `placements metrics get ${PLACEMENT_ID} --app ${TEST_APP_ID} --type paywall --group-by product`,
            );

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.contain('paywall');
            expect(callOf(fetchStub).url.search).to.equal('?type=paywall');
            expect(callOf(fetchStub).body).to.deep.equal({ segmentation_by: 'product' });
        });

        it('with --depth prints the segments of an audience, and sends --timezone as a header', async () => {
            fetchStub = mockFetch([PLACEMENT_BY_AUDIENCE]);

            const { stdout } = await runCommand(`${PLACEMENT_GET} --based-on audience --group-by country --depth 4 --timezone Europe/Berlin`);

            expect(stdout).to.equal([
                'Total                views 4  purchases 1  trials 0  revenue 9.99',
                '  All Users          views 4  purchases 1  trials 0  revenue 9.99',
                '    Variant B        views 4  purchases 1  trials 0  revenue 9.99',
                '      Sweden         views 3  purchases 0  trials 0  revenue 0.00',
                '      United States  views 1  purchases 1  trials 0  revenue 9.99',
                '',
            ].join('\n'));

            expect(callOf(fetchStub).headers.get('adapty-tz')).to.equal('Europe/Berlin');

            await runCommand(`${PLACEMENT_GET} --based-on audience --group-by country --depth 2`);

            expect(fetchStub.callCount).to.equal(2);
        });

        it('exits 2 without --type, before any request', async () => {
            fetchStub = mockFetch([PLACEMENT_TREE]);

            const { error } = await runCommand(`placements metrics get ${PLACEMENT_ID} --app ${TEST_APP_ID}`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('type');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('prints the tree like a flow tree, and --csv gives its rows', async () => {
            fetchStub = mockFetch([PLACEMENT_TREE]);

            const human = await runCommand(`${PLACEMENT_GET} --based-on flow`);

            expect(human.stdout).to.equal([
                'Total           views 13  purchases 8  trials 4  revenue 236.94',
                '  Welcome flow  views  9  purchases 7  trials 4  revenue 226.95',
                '  Promo flow    views  4  purchases 1  trials 0  revenue   9.99',
                '',
            ].join('\n'));

            const csv = await runCommand(`${PLACEMENT_GET} --based-on flow --csv`);
            const lines = csv.stdout.trimEnd().split('\n');

            expect(lines).to.have.length(4);
            expect(lines[1]?.startsWith('Total,root,Total,13,')).to.equal(true);
            expect(lines[2]?.startsWith('Total > Welcome flow,flow,Welcome flow,9,')).to.equal(true);
        });
    });

    describe('list', () => {
        const flowRow = (id: string, views: number, revenue: number) => node({ flow_id: id, revenue, views });
        const placementRow = (id: string, views: number, revenue: number) => node({ placement_id: id, revenue, views });

        it('flows metrics list joins the ids into one filter, whether repeated or comma-separated', async () => {
            const answer = { data: [flowRow(FLOW_ID, 19, 468.88), flowRow(OTHER_FLOW_ID, 8, 19.98)] };

            fetchStub = mockFetch([answer]);

            const { stdout } = await runCommand(`flows metrics list --app ${TEST_APP_ID} --ids ${FLOW_ID} --ids ${OTHER_FLOW_ID} --json`);

            expect(JSON.parse(stdout)).to.deep.equal(answer);

            const call = callOf(fetchStub);

            expect(call.method).to.equal('GET');
            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/flows/metrics/`);
            expect(call.url.searchParams.get('filter[flow_id]')).to.equal(`${FLOW_ID},${OTHER_FLOW_ID}`);
            expect([...call.url.searchParams.keys()]).to.deep.equal(['filter[flow_id]']);

            await runCommand(`flows metrics list --app ${TEST_APP_ID} --ids ${FLOW_ID},${OTHER_FLOW_ID}`);

            expect(callOf(fetchStub, 1).url.searchParams.get('filter[flow_id]')).to.equal(`${FLOW_ID},${OTHER_FLOW_ID}`);
        });

        it('prints one line for each id, and --csv one row for each id with its 27 metrics', async () => {
            fetchStub = mockFetch([{ data: [flowRow(FLOW_ID, 19, 468.88), flowRow(OTHER_FLOW_ID, 8, 19.98)] }]);

            const human = await runCommand(`flows metrics list --app ${TEST_APP_ID} --ids ${FLOW_ID},${OTHER_FLOW_ID}`);

            expect(human.stdout).to.equal([
                `${FLOW_ID}  views 19  purchases 0  trials 0  revenue 468.88`,
                `${OTHER_FLOW_ID}  views  8  purchases 0  trials 0  revenue  19.98`,
                '',
            ].join('\n'));

            const csv = await runCommand(`flows metrics list --app ${TEST_APP_ID} --ids ${FLOW_ID},${OTHER_FLOW_ID} --csv`);
            const lines = csv.stdout.trimEnd().split('\n');

            expect(lines[0]).to.equal(`flow_id,${METRICS.join(',')}`);
            expect(lines[1]?.startsWith(`${FLOW_ID},19,`)).to.equal(true);
            expect(lines[1]?.split(',')).to.have.length(28);
        });

        it('placements metrics list --csv has the id column named placement_id, and an empty answer is a bare header', async () => {
            fetchStub = mockFetch([{ data: [placementRow(PLACEMENT_ID, 13, 236.94)] }, { data: [] }]);

            const csv = await runCommand(`placements metrics list --app ${TEST_APP_ID} --type flow --ids ${PLACEMENT_ID} --csv`);
            const lines = csv.stdout.trimEnd().split('\n');

            expect(lines[0]).to.equal(`placement_id,${METRICS.join(',')}`);
            expect(lines[1]).to.equal(`${PLACEMENT_ID},13,0,0,0,0,236.94,${Array.from({ length: 21 }, () => '0').join(',')}`);

            const empty = await runCommand(`placements metrics list --app ${TEST_APP_ID} --type flow --ids ${PLACEMENT_ID} --csv`);

            expect(empty.stdout).to.equal('placement_id\n');
        });

        it('placements metrics list sends the type and the placement ids', async () => {
            fetchStub = mockFetch([{ data: [placementRow(PLACEMENT_ID, 13, 236.94)] }]);

            const { stdout } = await runCommand(
                `placements metrics list --app ${TEST_APP_ID} --type flow --ids ${PLACEMENT_ID},${OTHER_PLACEMENT_ID}`,
            );

            const call = callOf(fetchStub);

            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/placements/metrics/`);
            expect(call.url.searchParams.get('type')).to.equal('flow');
            expect(call.url.searchParams.get('filter[placement_id]')).to.equal(`${PLACEMENT_ID},${OTHER_PLACEMENT_ID}`);
            expect(stdout).to.equal(`${PLACEMENT_ID}  views 13  purchases 0  trials 0  revenue 236.94\n`);
        });

        it('says so when the server answers no rows, and exits 4 with the server text for an id of another app', async () => {
            fetchStub = mockFetch([{ data: [] }]);

            const empty = await runCommand(`flows metrics list --app ${TEST_APP_ID} --ids ${FLOW_ID}`);

            expect(empty.stdout).to.equal('No metrics for these IDs.\n');
            restoreFetch(fetchStub);

            fetchStub = mockFetchFailure(
                { error_code: 'not_found', errors: { non_field_errors: [`Flows not found: ${FLOW_ID}`] }, status_code: 404 },
                { status: 404 },
            );

            const { error } = await runCommand(`flows metrics list --app ${TEST_APP_ID} --ids ${FLOW_ID}`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.contain(FLOW_ID);
        });

        it('exits 2 for a missing --type, a missing id, a bad id and --timezone (only get takes it), before any request', async () => {
            fetchStub = mockFetch([{ data: [] }]);

            const cases: [string, string][] = [
                [`placements metrics list --app ${TEST_APP_ID} --ids ${PLACEMENT_ID}`, 'type'],
                [`placements metrics values ${PLACEMENT_ID} --app ${TEST_APP_ID}`, 'type'],
                [`placements metrics values nope --app ${TEST_APP_ID} --type flow`, 'Invalid placement ID'],
                [`placements metrics get nope --app ${TEST_APP_ID} --type flow`, 'Invalid placement ID'],
                [`flows metrics values nope --app ${TEST_APP_ID}`, 'Invalid flow ID'],
                [`flows metrics list --app ${TEST_APP_ID} --ids nope`, 'Invalid flow ID'],
                [`flows metrics list --app ${TEST_APP_ID} --timezone Europe/Berlin --ids ${FLOW_ID}`, 'timezone'],
                [`flows metrics values ${FLOW_ID} --app ${TEST_APP_ID} --timezone Europe/Berlin`, 'timezone'],
            ];

            for (const [command, text] of cases) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
                expect(error?.message, command).to.contain(text);
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 2 without --ids and for an id that is not a UUID', async () => {
            fetchStub = mockFetch([{ data: [] }]);

            const missing = await runCommand(`flows metrics list --app ${TEST_APP_ID}`);
            const bad = await runCommand(`placements metrics list --app ${TEST_APP_ID} --type flow --ids ${PLACEMENT_ID},nope`);

            expect(missing.error?.oclif?.exit).to.equal(exitCode.usage);
            expect(bad.error?.oclif?.exit).to.equal(exitCode.usage);
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('values', () => {
        let values: FilterValues;

        before(async () => {
            values = JSON.parse(await readFile(join(import.meta.dirname, '..', 'fixtures', 'metrics-values.json'), 'utf8')) as FilterValues;
        });

        it('flows metrics values reads the values route and prints label (value), nested as the server nests them', async () => {
            fetchStub = mockFetch([values]);

            const { stdout } = await runCommand(`flows metrics values ${FLOW_ID} --app ${TEST_APP_ID}`);

            const call = callOf(fetchStub);

            expect(call.method).to.equal('GET');
            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/flows/${FLOW_ID}/metrics/values/`);
            expect(call.url.search).to.equal('');

            expect(stdout.split('\n').slice(0, 13)).to.deep.equal([
                'Attribution (attribution)',
                '  Campaign (attribution_campaign)',
                '    No Data ()',
                '    Q4,Launch (Q4,Launch)',
                '  Channel (attribution_channel)',
                '    No Data ()',
                'Country (country)',
                '  Americas (Americas)',
                '    United States (US)',
                '  Europe (Europe)',
                '    Germany (DE)',
                'Screen (flow_screen_id)',
                '  1. Welcome (0b0c7e9e-3c06-4f7a-9d7e-2f2f6d3c1b11:scr_a1B2c3D4)',
            ]);
        });

        it('says so when the server lists no filter values', async () => {
            fetchStub = mockFetch([{ data: [], meta: null }]);

            const { stdout } = await runCommand(`flows metrics values ${FLOW_ID} --app ${TEST_APP_ID}`);

            expect(stdout).to.equal('No filter values.\n');
        });

        it('placements metrics values sends the type, and --json is the answer', async () => {
            fetchStub = mockFetch([values]);

            const { stdout } = await runCommand(`placements metrics values ${PLACEMENT_ID} --app ${TEST_APP_ID} --type flow --json`);

            const call = callOf(fetchStub);

            expect(JSON.parse(stdout)).to.deep.equal(values);
            expect(url(call)).to.equal(`${BASE}/apps/${TEST_APP_ID}/placements/${PLACEMENT_ID}/metrics/values/`);
            expect(call.url.search).to.equal('?type=flow');
        });

        it('every leaf that values lists goes into the request as --filter key=value, a comma escaped, and comes out unchanged', async () => {
            const pairs = leaves(values.data);

            fetchStub = mockFetch([FLOW_TREE]);

            for (const [key, value] of pairs) {
                const { error } = await runCommand([...FLOW_GET.split(' '), '--filter', `${key}=${value.replaceAll(',', String.raw`\,`)}`, '--json']);

                expect(error, `${key}=${value}`).to.equal(undefined);
            }

            const stub = fetchStub;
            const sent = pairs.map((_, index) => (callOf(stub, index).body as { filters: unknown }).filters);

            expect(sent).to.deep.equal(pairs.map(([key, value]) => ({ [key]: [value] })));
        });
    });

    describe('placements list --type', () => {
        it('sends filter[placement_type] only when --type is given, and shows the type of each placement', async () => {
            const answer = {
                data: [
                    { developer_id: 'main', id: PLACEMENT_ID, is_active: true, title: 'Main', type: 'flow' },
                    { developer_id: 'old', id: OTHER_PLACEMENT_ID, is_active: true, title: 'Old', type: null },
                ],
                meta: { pagination: { count: 2, page: 1, pages: 1 } },
            };

            fetchStub = mockFetch([answer]);

            const { stdout } = await runCommand(`placements list --app ${TEST_APP_ID} --type flow`);

            expect(callOf(fetchStub).url.searchParams.get('filter[placement_type]')).to.equal('flow');
            expect(stdout).to.contain('Type: flow');
            // the second placement has no type: the human view leaves it out, as it leaves out every empty value
            expect(stdout.match(/Type:/g)).to.have.length(1);

            const json = await runCommand(`placements list --app ${TEST_APP_ID} --json`);

            expect((JSON.parse(json.stdout) as { data: { type: null | string }[] }).data.map(item => item.type)).to.deep.equal(['flow', null]);

            expect(callOf(fetchStub, 1).url.searchParams.has('filter[placement_type]')).to.equal(false);
        });

        it('sends a type it cannot judge, and the server answer is the error (exit 4)', async () => {
            fetchStub = mockFetchFailure(
                {
                    error_code: 'validation_error',
                    errors: { 'filter[placement_type]': ['Allowed values: paywall, flow, onboarding'] },
                    status_code: 400,
                },
                { status: 400 },
            );

            const { error } = await runCommand(`placements list --app ${TEST_APP_ID} --type foo`);

            expect(error?.message).to.contain('Allowed values: paywall, flow, onboarding');
            expect(callOf(fetchStub).url.searchParams.get('filter[placement_type]')).to.equal('foo');
        });
    });
});
