import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { run } from '@oclif/core';
import { captureOutput } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    mockFetch,
    mockFetchFailure,
    mockFetchSteps,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

const ROOT = join(import.meta.dirname, '..', '..');

const runCommand = (line: string) => captureOutput(async () => run(line.split(' '), { root: ROOT }));

const ID = TEST_RESOURCE_ID;
const PLACEMENT = '770e8400-e29b-41d4-a716-446655440002';
const FLOW = '880e8400-e29b-41d4-a716-446655440003';
const VARIANT = '990e8400-e29b-41d4-a716-446655440004';
const TEST = 'aa0e8400-e29b-41d4-a716-446655440005';
const ROW = 'bb0e8400-e29b-41d4-a716-446655440006';
const PRODUCT = 'cc0e8400-e29b-41d4-a716-446655440007';
const CHILD = 'dd0e8400-e29b-41d4-a716-446655440008';
const OTHER_CHILD = 'ee0e8400-e29b-41d4-a716-446655440009';
const BASE = `/apps/${TEST_APP_ID}/hypotheses`;
const APP = `--app ${TEST_APP_ID}`;

const hypothesis = (overrides: Record<string, unknown> = {}) => ({
    ab_test: null,
    ab_test_id: null,
    action: 'Show the plans before the trial screen',
    allowed_actions: ['accept', 'dismiss', 'reorder'],
    app_id: TEST_APP_ID,
    created_at: '2026-11-12T10:00:00Z',
    dismiss_reason: null,
    examples: [],
    expected: { evidence_text: 'Similar apps', high_pct: 12, low_pct: 4, metric: 'arpu' },
    hypothesis_id: ID,
    is_legacy: false,
    is_projected: false,
    judged_by: null,
    media_url: null,
    metrics_impact: ['arpu'],
    outcome: null,
    parent_hypothesis_id: null,
    phase: 'proposed',
    placement: { id: PLACEMENT, is_removed: false, title: 'Onboarding' },
    placement_audience_id: null,
    placement_id: PLACEMENT,
    products: [],
    rationale: 'Most users leave on screen 3',
    resolved_at: null,
    source: 'developer_api',
    stale: 'fresh',
    state: 'proposed',
    subject: {
        country_code: null,
        flow_id: FLOW,
        flow_screen_id: null,
        flow_version_id: null,
        is_removed: false,
        paywall_id: null,
        segment_id: null,
        title: 'Main onboarding',
        type: 'flow',
    },
    suggested_result: null,
    title: 'Plans first',
    type: 'adapty:flow_design',
    variant_flow_id: null,
    ...overrides,
});

/** The server builds `outcome` from `variant_flow_id`, so a row with a variant carries both. */
const withVariant = { outcome: { id: VARIANT, is_removed: false, kind: 'flow', title: 'Plans first' }, variant_flow_id: VARIANT };

const accepted = { allowed_actions: ['unaccept', 'dismiss', 'link', 'resolve', 'reorder'], phase: 'accepted', state: 'accepted' };

/** by-ab-test returns only rows the test judges: accepted and linked to it, or resolved by it. */
const linked = (abTestId: string) => ({
    ...accepted,
    ...withVariant,
    ab_test: { id: abTestId, is_removed: false, parent_ab_test_id: null, started_at: '2026-11-01T10:00:00Z', state: 'live', stopped_at: null, type: 'regular_flow', winner_flow_id: null },
    ab_test_id: abTestId,
    allowed_actions: ['reorder'],
    phase: 'testing',
});

const bodyOf = (stub: sinon.SinonStub, index: number): unknown =>
    JSON.parse((stub.getCall(index).args[1] as { body: string }).body);

const fileWith = async (content: unknown): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), 'adapty-hypotheses-'));
    const path = join(dir, 'body.json');

    await writeFile(path, JSON.stringify(content));

    return path;
};

describe('hypotheses', () => {
    let fetchStub: sinon.SinonStub | undefined;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        delete process.env.ADAPTY_TOKEN;
        process.exitCode = undefined;
    });

    describe('reads', () => {
        it('list sends repeated filters comma separated and prints the allowed actions without reorder', async () => {
            fetchStub = mockFetch([{ data: [hypothesis()], meta: { pagination: { count: 1, page: 1, pages: 1 } } }]);

            const { stdout } = await runCommand(
                `hypotheses list ${APP} --state proposed --state accepted --placement ${PLACEMENT} --type adapty:flow_design --order-by -created_at`,
            );

            assertFetch({
                callIndex: 0,
                method: 'GET',
                path: `${BASE}/`,
                query: {
                    'filter[placement_id]': PLACEMENT,
                    'filter[state]': 'proposed,accepted',
                    'filter[type]': 'adapty:flow_design',
                    'order_by': '-created_at',
                    'page[number]': '1',
                    'page[size]': '20',
                },
                stub: fetchStub,
            });

            expect(stdout).to.contain(`ID: ${ID}`);
            expect(stdout).to.contain('Allowed Actions: accept, dismiss\n');
            expect(stdout).to.contain(`Placement: Onboarding (${PLACEMENT})`);
            expect(stdout).to.contain(`Subject: flow Main onboarding (${FLOW})\nVariant: —\n`);
            expect(stdout).to.contain('Page 1 of 1');
        });

        it('list sends the id and phase filters, and --json prints the page as it came', async () => {
            const page = { data: [hypothesis()], meta: { pagination: { count: 1, page: 1, pages: 1 } } };

            fetchStub = mockFetch([page]);

            const { stdout } = await runCommand(
                `hypotheses list ${APP} --flow ${FLOW} --variant-flow ${VARIANT} --segment ${ROW} --parent ${ID} --parent ${TEST} --phase testing --phase applied --page 2 --page-size 5 --json`,
            );

            assertFetch({
                callIndex: 0,
                method: 'GET',
                path: `${BASE}/`,
                query: {
                    'filter[flow_id]': FLOW,
                    'filter[parent_hypothesis_id]': `${ID},${TEST}`,
                    'filter[phase]': 'testing,applied',
                    'filter[segment_id]': ROW,
                    'filter[variant_flow_id]': VARIANT,
                    'page[number]': '2',
                    'page[size]': '5',
                },
                stub: fetchStub,
            });

            expect(JSON.parse(stdout)).to.deep.equal(page);
        });

        for (const flag of ['state', 'phase']) {
            it(`list refuses --${flag} with a comma or empty, naming --${flag}, with no request`, async () => {
                fetchStub = mockFetch([]);

                for (const value of ['proposed,accepted', ' ']) {
                    const { error } = await captureOutput(async () => run(['hypotheses', 'list', '--app', TEST_APP_ID, `--${flag}`, value], { root: ROOT }));

                    expect(error?.message).to.contain(`--${flag} takes one value; repeat the flag for several.`);
                    expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.usage);
                }

                expect(fetchStub.called).to.equal(false);
            });
        }

        it('list leaves the state vocabulary to the server: an unknown state is its 400, exit 4', async () => {
            fetchStub = mockFetchFailure(
                { error_code: 'base_error', errors: { state: ['Input should be \'proposed\', \'accepted\', \'dismissed\', \'won\', \'lost\' or \'inconclusive\''] }, status_code: 400 },
                { status: 400 },
            );

            const { error } = await runCommand(`hypotheses list ${APP} --state open`);

            assertFetch({ callIndex: 0, method: 'GET', path: `${BASE}/`, query: { 'filter[state]': 'open' }, stub: fetchStub });
            expect(error?.message).to.contain('Input should be \'proposed\'');
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.api);
        });

        it('get shows the whole row; an accepted row that tests shows its phase and its test', async () => {
            fetchStub = mockFetch([hypothesis({
                ab_test: { id: TEST, is_removed: false, parent_ab_test_id: null, started_at: '2026-11-01T10:00:00Z', state: 'live', stopped_at: null, type: 'regular_flow', winner_flow_id: null },
                ab_test_id: TEST,
                allowed_actions: ['reorder'],
                ...withVariant,
                phase: 'testing',
                state: 'accepted',
            })]);

            const { stdout } = await runCommand(`hypotheses get ${APP} ${ID}`);

            assertFetch({ callIndex: 0, method: 'GET', path: `${BASE}/${ID}/`, stub: fetchStub });
            expect(stdout).to.contain('Allowed Actions: none');
            expect(stdout).to.contain('State: accepted (phase testing)');
            expect(stdout).to.contain(`A/B Test: ${TEST} (live)`);
            expect(stdout).to.contain(`Variant: flow Plans first (${VARIANT})`);
            expect(stdout).not.to.contain('Outcome:');
            expect(stdout).to.contain('Expected: arpu 4% to 12%: Similar apps');
            expect(stdout).not.to.contain('Stale:');
        });

        it('get lists the product rows, filled or not', async () => {
            fetchStub = mockFetch([hypothesis({
                products: [{
                    country: null,
                    currency: 'USD',
                    current_local_price: 39.99,
                    duration_type: 'annual',
                    hypothesis_product_id: ROW,
                    is_exist: false,
                    position: 0,
                    price: 49.99,
                    product: null,
                    product_id: null,
                    store_product_id: 'com.app.annual.trial',
                    trial_duration: 7,
                }],
            })]);

            const { stdout } = await runCommand(`hypotheses get ${APP} ${ID}`);

            expect(stdout).to.contain(`  - ${ROW}: annual, trial 7 days, store id com.app.annual.trial, price 49.99 USD, current local price 39.99; not filled`);
        });

        it('get shows the examples, the media and when it was resolved, with the test that judged it', async () => {
            fetchStub = mockFetch([hypothesis({
                ab_test: { id: TEST, is_removed: true, parent_ab_test_id: null, started_at: '2026-11-01T10:00:00Z', state: 'completed', stopped_at: '2026-11-13T10:00:00Z', type: 'regular_flow', winner_flow_id: VARIANT },
                ab_test_id: TEST,
                allowed_actions: ['reresolve'],
                examples: ['App A shows plans first'],
                judged_by: 'ab_test',
                media_url: 'https://cdn.example.com/shot.png',
                phase: 'won',
                resolved_at: '2026-11-13T10:00:00Z',
                state: 'won',
                ...withVariant,
            })]);

            const { stdout } = await runCommand(`hypotheses get ${APP} ${ID}`);

            expect(stdout).to.contain('State: won\n');
            expect(stdout).to.contain(`A/B Test: ${TEST} (completed, winner flow ${VARIANT}, removed)`);
            expect(stdout).to.contain('Media: https://cdn.example.com/shot.png');
            expect(stdout).to.contain('Resolved At: 2026-11-13T10:00:00Z');
            expect(stdout).to.contain('Examples:\n  - App A shows plans first');
        });

        it('get shows what the linked test suggests, the parent and a stale flow', async () => {
            fetchStub = mockFetch([hypothesis({
                ab_test: { id: TEST, is_removed: false, parent_ab_test_id: null, started_at: '2026-11-01T10:00:00Z', state: 'completed', stopped_at: '2026-11-10T10:00:00Z', type: 'regular_flow', winner_flow_id: FLOW },
                ab_test_id: TEST,
                allowed_actions: ['dismiss', 'resolve', 'reorder'],
                expected: { evidence_text: null, high_pct: null, low_pct: null, metric: 'ltv' },
                outcome: { id: VARIANT, is_removed: true, kind: 'flow', title: null },
                parent_hypothesis_id: ROW,
                products: [{
                    country: 'US',
                    currency: null,
                    current_local_price: null,
                    duration_type: 'annual',
                    hypothesis_product_id: ROW,
                    is_exist: true,
                    position: 0,
                    price: null,
                    product: { id: PRODUCT, is_removed: true, title: 'Annual' },
                    product_id: PRODUCT,
                    store_product_id: null,
                    trial_duration: null,
                }],
                phase: 'ended',
                stale: 'flow_deleted',
                state: 'accepted',
                suggested_result: 'lost',
                variant_flow_id: VARIANT,
            })]);

            const { stdout } = await runCommand(`hypotheses get ${APP} ${ID}`);

            expect(stdout).to.contain(`A/B Test: ${TEST} (completed, winner flow ${FLOW})`);
            expect(stdout).to.contain(`Variant: flow ${VARIANT}, removed`);
            expect(stdout).to.contain('Suggested Result: lost');
            expect(stdout).to.contain('Stale: flow_deleted');
            expect(stdout).to.contain(`Parent: ${ROW}`);
            expect(stdout).to.contain('Expected: ltv\n');
            expect(stdout).to.contain(`  - ${ROW}: annual, country US; product Annual (${PRODUCT}), removed`);
        });

        it('get names a linked test the answer carries by id only', async () => {
            fetchStub = mockFetch([hypothesis({ ...accepted, ...withVariant, ab_test: null, ab_test_id: TEST, allowed_actions: ['unaccept', 'dismiss', 'unlink', 'resolve', 'reorder'] })]);

            const { stdout } = await runCommand(`hypotheses get ${APP} ${ID}`);

            expect(stdout).to.contain(`A/B Test: ${TEST}\n`);
            expect(stdout).not.to.contain('Suggested Result');
        });

        it('get prints an expected range or evidence that came without a metric', async () => {
            fetchStub = mockFetch([
                hypothesis({ allowed_actions: [], expected: { evidence_text: 'Similar apps', high_pct: 12, low_pct: 4, metric: null }, judged_by: 'user', phase: 'won', resolved_at: '2026-11-13T10:00:00Z', state: 'won' }),
                hypothesis({ expected: { evidence_text: 'Similar apps', high_pct: null, low_pct: null, metric: null } }),
            ]);

            const range = await runCommand(`hypotheses get ${APP} ${ID}`);
            const evidence = await runCommand(`hypotheses get ${APP} ${ID}`);

            expect(range.stdout).to.contain('Expected: 4% to 12%: Similar apps');
            expect(range.stdout).to.contain('Judged By: user');
            expect(evidence.stdout).to.contain('Expected: Similar apps');
        });

        it('by-ab-test of a crossplacement test prints one block per hypothesis', async () => {
            fetchStub = mockFetch([{ data: [hypothesis(linked(CHILD)), hypothesis({ ...linked(OTHER_CHILD), hypothesis_id: ROW, placement: { id: PRODUCT, is_removed: false, title: 'Paywall screen' }, placement_id: PRODUCT, title: 'Second placement' })] }]);

            const { stdout } = await runCommand(`hypotheses by-ab-test ${APP} ${TEST}`);

            expect(stdout).to.contain(`ID: ${ID}`);
            expect(stdout).to.contain(`---\nID: ${ROW}\nTitle: Second placement`);
            expect(stdout).not.to.contain('Rationale:');
        });

        for (const type of ['adapty:trial,adapty:flow_design', 'flow_design', 'adapty:', ':flow_design']) {
            it(`list refuses --type ${type}, with no request`, async () => {
                fetchStub = mockFetch([]);

                const { error } = await runCommand(`hypotheses list ${APP} --type ${type}`);

                expect(error?.message).to.contain('--type takes one namespace:name');
                expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.usage);
                expect(fetchStub.called).to.equal(false);
            });
        }

        it('the subject title goes to the entity its type names', async () => {
            const subject = { country_code: 'US', flow_id: null, flow_screen_id: null, flow_version_id: null, is_removed: false, paywall_id: null, segment_id: ROW, title: 'Payers' };

            fetchStub = mockFetch([
                hypothesis({ subject: { ...subject, type: 'audience' } }),
                hypothesis({ allowed_actions: ['dismiss', 'reorder'], is_legacy: true, subject: { ...subject, is_removed: true, paywall_id: PRODUCT, title: 'Old paywall', type: 'paywall' } }),
                hypothesis({ allowed_actions: ['accept', 'dismiss'], is_projected: true, subject: { ...subject, flow_id: FLOW, flow_screen_id: 's3', title: 'Main onboarding', type: 'flow_screen' } }),
            ]);

            const audience = await runCommand(`hypotheses get ${APP} ${ID}`);
            const legacy = await runCommand(`hypotheses get ${APP} ${ID}`);
            const screen = await runCommand(`hypotheses get ${APP} ${ID}`);

            expect(audience.stdout).to.contain(`Subject: audience, segment Payers (${ROW}), country US`);
            expect(legacy.stdout).to.contain(`Subject: segment ${ROW}, paywall Old paywall (${PRODUCT}), removed, country US`);
            expect(legacy.stdout).to.contain('Legacy: yes');
            expect(screen.stdout).to.contain(`Subject: flow_screen, flow Main onboarding (${FLOW}), screen s3, segment ${ROW}, country US`);
            expect(screen.stdout).to.contain('(shown on the filtered placement through its flow)');
        });

        it('an empty page says nothing matches before the footer, an empty summary says so', async () => {
            fetchStub = mockFetch([{ data: [], meta: { pagination: { count: 0, page: 1, pages: 1 } } }, { data: [] }]);

            const list = await runCommand(`hypotheses list ${APP}`);
            const summary = await runCommand(`hypotheses summary ${APP}`);

            expect(list.stdout).to.contain('No hypotheses match.\n\nPage 1 of 1 (0 total)');
            expect(summary.stdout).to.contain('No hypotheses in the backlog.');
        });

        it('get refuses an ID that is not a UUID, with no request', async () => {
            fetchStub = mockFetch([]);

            const { error } = await runCommand(`hypotheses get ${APP} nope`);

            expect(error?.message).to.contain('Invalid hypothesis ID format');
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.usage);
            expect(fetchStub.called).to.equal(false);
        });

        it('summary prints a row per placement', async () => {
            fetchStub = mockFetch([{
                data: [{
                    accepted_by_phase: { testing: 2 },
                    attention_count: 1,
                    legacy_count: 0,
                    placement_id: PLACEMENT,
                    projected_count: 3,
                    proposed: 4,
                }],
            }]);

            const { stdout } = await runCommand(`hypotheses summary ${APP}`);

            assertFetch({ callIndex: 0, method: 'GET', path: `${BASE}/summary/`, stub: fetchStub });
            expect(stdout).to.match(new RegExp(`${PLACEMENT}\\s+4\\s+0\\s+0\\s+2\\s+0\\s+1\\s+0\\s+3`));
        });

        it('summary has no applied column, a column for a phase it does not know, and --json is the answer', async () => {
            const answer = {
                data: [{
                    accepted_by_phase: { paused: 5 },
                    attention_count: 0,
                    legacy_count: 0,
                    placement_id: PLACEMENT,
                    projected_count: 0,
                    proposed: 0,
                }],
            };

            fetchStub = mockFetch([answer, answer]);

            const { stdout } = await runCommand(`hypotheses summary ${APP}`);
            const json = await runCommand(`hypotheses summary ${APP} --json`);

            expect(stdout).to.match(/Ended\s+Paused\s+Need attention/);
            expect(stdout).not.to.contain('Applied');
            expect(stdout).to.match(new RegExp(`${PLACEMENT}\\s+0\\s+0\\s+0\\s+0\\s+0\\s+5\\s+0`));
            expect(JSON.parse(json.stdout)).to.deep.equal(answer);
        });

        it('by-ab-test of a test linked to none says so, exit 0', async () => {
            fetchStub = mockFetch([{ data: [] }]);

            const { error, stdout } = await runCommand(`hypotheses by-ab-test ${APP} ${TEST}`);
            const json = await runCommand(`hypotheses by-ab-test ${APP} ${TEST} --json`);

            expect(error).to.equal(undefined);
            expect(stdout).to.equal('No hypothesis is linked to this A/B test.\n');
            expect(JSON.parse(json.stdout)).to.deep.equal({ data: [] });
        });

        it('by-ab-test of an unknown test is ab_test_not_found, exit 4', async () => {
            fetchStub = mockFetchFailure(
                { error_code: 'ab_test_not_found', errors: { non_field_errors: ['A/B test not found'] }, status_code: 404 },
                { status: 404 },
            );

            const { error } = await runCommand(`hypotheses by-ab-test ${APP} ${TEST}`);

            expect(error?.message).to.contain('A/B test not found');
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.api);
        });

        it('get keeps the server text of hypothesis_not_found', async () => {
            fetchStub = mockFetchFailure(
                { error_code: 'hypothesis_not_found', errors: { non_field_errors: ['Hypothesis not found'] }, status_code: 404 },
                { status: 404 },
            );

            const { error } = await runCommand(`hypotheses get ${APP} ${ID}`);

            expect(error?.message).to.contain('Hypothesis not found');
        });

        it('a dismissed row says when it was dismissed, and free text keeps its lines under the label', async () => {
            fetchStub = mockFetch([hypothesis({
                allowed_actions: ['restore'],
                examples: ['App A\nshows plans first'],
                phase: 'dismissed',
                rationale: 'Users leave on screen 3.\nAction: not a field',
                resolved_at: '2026-11-13T10:00:00Z',
                state: 'dismissed',
            })]);

            const { stdout } = await runCommand(`hypotheses get ${APP} ${ID}`);

            expect(stdout).to.contain('Dismissed At: 2026-11-13T10:00:00Z');
            expect(stdout).not.to.contain('Resolved At:');
            expect(stdout).to.contain('Rationale: Users leave on screen 3.\n  Action: not a field');
            expect(stdout).to.contain('Examples:\n  - App A\n    shows plans first');
            expect(stdout).not.to.contain('Dismiss Reason:');
        });

        it('dismiss --reason sends the reason and shows it', async () => {
            fetchStub = mockFetch([hypothesis({
                allowed_actions: ['restore'],
                dismiss_reason: 'Shipped with the new pricing',
                phase: 'dismissed',
                resolved_at: '2026-11-13T10:00:00Z',
                state: 'dismissed',
            })]);

            const { stdout } = await captureOutput(async () => run(['hypotheses', 'dismiss', '--app', TEST_APP_ID, ID, '--reason', 'Shipped with the new pricing'], { root: ROOT }));

            assertFetch({ callIndex: 0, method: 'POST', path: `${BASE}/${ID}/dismiss/`, stub: fetchStub });
            expect(bodyOf(fetchStub, 0)).to.deep.equal({ reason: 'Shipped with the new pricing' });
            expect(stdout).to.contain('Dismiss Reason: Shipped with the new pricing');
        });

        it('by-ab-test reads the hypotheses of the test', async () => {
            fetchStub = mockFetch([{ data: [hypothesis(linked(TEST))] }]);

            const { stdout } = await runCommand(`hypotheses by-ab-test ${APP} ${TEST}`);

            assertFetch({ callIndex: 0, method: 'GET', path: `${BASE}/by-ab-test/${TEST}/`, stub: fetchStub });
            expect(stdout).to.contain('Title: Plans first');
        });

        it('a disabled server says so with exit 4', async () => {
            fetchStub = mockFetchFailure(
                { error_code: 'hypotheses_disabled', errors: { non_field_errors: ['Hypotheses are not enabled yet'] }, status_code: 404 },
                { status: 404 },
            );

            const { error } = await runCommand(`hypotheses summary ${APP}`);

            expect(error?.message).to.contain('Hypotheses are not enabled yet');
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.api);
        });
    });

    describe('create', () => {
        const created = (status: number, id = ID) => ({
            data: [{ data: hypothesis({ hypothesis_id: id }), hypothesis_id: id, status }],
        });

        /** Answers as the server does: one item per sent item, under the id it was sent with. */
        const echoCreated = (status: number): sinon.SinonStub => sinon.stub(globalThis, 'fetch').callsFake((_url, init) => {
            const { hypotheses } = JSON.parse(init?.body as string) as { hypotheses: { hypothesis_id: string }[] };

            const data = hypotheses.map(({ hypothesis_id: id }) => (
                { data: hypothesis({ hypothesis_id: id }), hypothesis_id: id, status }
            ));

            return Promise.resolve(new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' }, status: 200 }));
        });

        it('a single body goes to the batch route with its own id', async () => {
            fetchStub = mockFetch([created(201)]);

            const path = await fileWith({ hypothesis_id: ID, placement_id: PLACEMENT, title: 'Plans first' });
            const { stderr, stdout } = await runCommand(`hypotheses create ${APP} --file ${path}`);

            assertFetch({ callIndex: 0, method: 'POST', path: `${BASE}/batch/`, stub: fetchStub });
            expect(bodyOf(fetchStub, 0)).to.deep.equal({ hypotheses: [{ hypothesis_id: ID, placement_id: PLACEMENT, title: 'Plans first' }] });
            expect(stderr).not.to.contain('hypothesis_id');
            expect(stdout).to.contain(`Created: ${ID}`);
        });

        it('an item without an id gets one, printed to stderr', async () => {
            fetchStub = echoCreated(201);

            const path = await fileWith([{ placement_id: PLACEMENT, title: 'Plans first' }]);
            const { stderr, stdout } = await runCommand(`hypotheses create ${APP} --file ${path}`);

            const sent = bodyOf(fetchStub, 0) as { hypotheses: { hypothesis_id: string }[] };
            const minted = sent.hypotheses[0]?.hypothesis_id ?? '';

            expect(minted).to.match(/^[\da-f-]{36}$/);
            expect(stderr).to.contain(`Sending new hypothesis_id: ${minted}. If the answer is lost, put each into its body as hypothesis_id and resend.`);
            expect(stdout).to.contain(`Created: ${minted}`);
        });

        it('with --json the new id still goes to stderr, and stdout is the answer', async () => {
            fetchStub = echoCreated(201);

            const { stderr, stdout } = await runCommand(`hypotheses create ${APP} --file ${await fileWith({ title: 'x' })} --json`);

            const sent = bodyOf(fetchStub, 0) as { hypotheses: { hypothesis_id: string }[] };
            const minted = sent.hypotheses[0]?.hypothesis_id ?? 'missing';

            expect(stderr).to.contain(`Sending new hypothesis_id: ${minted}`);
            expect(JSON.parse(stdout)).to.deep.equal(created(201, minted));
        });

        it('takes {"hypotheses": [...]}, and --force sets force on each', async () => {
            fetchStub = echoCreated(201);

            const path = await fileWith({ hypotheses: [{ hypothesis_id: ID }, { hypothesis_id: ROW }] });

            await runCommand(`hypotheses create ${APP} --file ${path} --force`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({
                hypotheses: [{ force: true, hypothesis_id: ID }, { force: true, hypothesis_id: ROW }],
            });
        });

        it('prints every item of a batch, created or already stored', async () => {
            fetchStub = mockFetch([{
                data: [
                    { data: hypothesis(), hypothesis_id: ID, status: 201 },
                    { data: hypothesis({ hypothesis_id: ROW }), hypothesis_id: ROW, status: 200 },
                ],
            }]);

            const { stdout } = await runCommand(`hypotheses create ${APP} --file ${await fileWith([{ hypothesis_id: ID }, { hypothesis_id: ROW }])}`);

            expect(stdout).to.contain(`Created: ${ID}`);
            expect(stdout).to.contain(`---\nAlready stored: ${ROW}`);
        });

        it('names stdin in an error about --file -', async () => {
            fetchStub = mockFetch([]);

            const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
            const input = new PassThrough();

            input.end('[3]');
            Object.defineProperty(process, 'stdin', { configurable: true, value: input });

            try {
                const { error } = await runCommand(`hypotheses create ${APP} --file -`);

                expect(error?.message).to.contain('Item 1 of stdin is not a JSON object');
            } finally {
                if (descriptor) {
                    Object.defineProperty(process, 'stdin', descriptor);
                }
            }
        });

        it('--json prints the batch answer as it came', async () => {
            fetchStub = mockFetch([created(201)]);

            const { stdout } = await runCommand(`hypotheses create ${APP} --file ${await fileWith({ hypothesis_id: ID })} --json`);

            expect(JSON.parse(stdout)).to.deep.equal(created(201));
        });

        it('reads the body from stdin with --file -', async () => {
            fetchStub = mockFetch([created(201)]);

            const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
            const input = new PassThrough();

            input.end(JSON.stringify({ hypothesis_id: ID, title: 'From stdin' }));
            Object.defineProperty(process, 'stdin', { configurable: true, value: input });

            try {
                await runCommand(`hypotheses create ${APP} --file -`);
            } finally {
                if (descriptor) {
                    Object.defineProperty(process, 'stdin', descriptor);
                }
            }

            expect(bodyOf(fetchStub, 0)).to.deep.equal({ hypotheses: [{ hypothesis_id: ID, title: 'From stdin' }] });
        });

        it('refuses a batch body with a key beside hypotheses, with no request', async () => {
            fetchStub = mockFetch([]);

            const { error } = await runCommand(`hypotheses create ${APP} --file ${await fileWith({ force: true, hypotheses: [{ hypothesis_id: ID }] })}`);

            expect(error?.message).to.contain('takes no other key, found force. Set force on each item, or pass --force.');
            expect(fetchStub.called).to.equal(false);
        });

        it('names a key beside hypotheses that is not force without the --force advice', async () => {
            fetchStub = mockFetch([]);

            const { error } = await runCommand(`hypotheses create ${APP} --file ${await fileWith({ foo: 1, hypotheses: [{ hypothesis_id: ID }] })}`);

            expect(error?.message).to.contain('takes no other key, found foo.');
            expect(error?.message).not.to.contain('--force');
            expect(fetchStub.called).to.equal(false);
        });

        it('refuses {"hypotheses": {...}} that is not an array, with no request', async () => {
            fetchStub = mockFetch([]);

            const { error } = await runCommand(`hypotheses create ${APP} --file ${await fileWith({ hypotheses: { hypothesis_id: ID } })}`);

            expect(error?.message).to.contain('"hypotheses" must be an array');
            expect(fetchStub.called).to.equal(false);
        });

        it('without a token announces no new id', async () => {
            delete process.env.ADAPTY_TOKEN;
            fetchStub = mockFetch([]);

            const { error, stderr } = await runCommand(`hypotheses create ${APP} --file ${await fileWith({ title: 'x' })}`);

            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.auth);
            expect(stderr).not.to.contain('hypothesis_id');
            expect(fetchStub.called).to.equal(false);
        });

        it('sends a malformed id as it is and shows the server refusal by item', async () => {
            fetchStub = mockFetchSteps([{
                body: { error_code: 'base_error', errors: { 'hypotheses.1.hypothesis_id': ['invalid length: expected length 32 for simple format, found 3'] }, status_code: 400 },
                status: 400,
            }]);

            const { error } = await runCommand(`hypotheses create ${APP} --file ${await fileWith([{ hypothesis_id: ID }, { hypothesis_id: 'abc' }])}`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({ hypotheses: [{ hypothesis_id: ID }, { hypothesis_id: 'abc' }] });
            expect(error?.message).to.contain('item 2, hypothesis_id: invalid length');
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.api);
        });

        it('names each new id by its item in a batch where only some items lack one', async () => {
            fetchStub = echoCreated(201);

            const { stderr } = await runCommand(`hypotheses create ${APP} --file ${await fileWith([{ title: 'a' }, { hypothesis_id: ID }, { title: 'c' }])}`);

            const { hypotheses } = bodyOf(fetchStub, 0) as { hypotheses: { hypothesis_id: string }[] };
            const sent = hypotheses.map(item => item.hypothesis_id);

            expect(sent[1]).to.equal(ID);
            expect(stderr).to.contain(`Sending new hypothesis_id: item 1 ${sent[0] ?? ''}, item 3 ${sent[2] ?? ''}. If the answer is lost`);
        });

        it('an index-only and a nested server path count items from 1; --json keeps the server keys in errors', async () => {
            const errors = { 'hypotheses.0.subject.flow_id': ['Field required'], 'hypotheses.1': ['Value error, metric, low_pct and high_pct come together'] };

            fetchStub = mockFetchSteps([{ body: { error_code: 'base_error', errors, status_code: 400 }, status: 400 }]);

            const { stdout } = await runCommand(`hypotheses create ${APP} --file ${await fileWith([{ hypothesis_id: ID }, { hypothesis_id: ROW }])} --json`);
            const answer = (JSON.parse(stdout) as { error: { errors: unknown; message: string } }).error;

            expect(answer.message).to.equal('item 1, subject.flow_id: Field required; item 2: Value error, metric, low_pct and high_pct come together');
            expect(answer.errors).to.deep.equal(errors);
        });

        it('server field paths count items from 1, and a single item drops them', async () => {
            const failure = {
                error_code: 'base_error',
                errors: { 'hypotheses.0.examples': ['Input should be a valid list'], 'hypotheses.1.title': ['Field required'] },
                status_code: 400,
            };

            fetchStub = mockFetchSteps([{ body: failure, status: 400 }, { body: failure, status: 400 }]);

            const batch = await runCommand(`hypotheses create ${APP} --file ${await fileWith([{ hypothesis_id: ID }, { hypothesis_id: ROW }])}`);
            const single = await runCommand(`hypotheses create ${APP} --file ${await fileWith({ hypothesis_id: ID })}`);

            expect(batch.error?.message).to.contain('item 1, examples: Input should be a valid list; item 2, title: Field required');
            expect(single.error?.message).to.match(/^examples: Input should be a valid list; title: Field required/);
        });

        it('refuses an item that is not an object, with no request', async () => {
            fetchStub = mockFetch([]);

            const scalar = await runCommand(`hypotheses create ${APP} --file ${await fileWith([{ hypothesis_id: ID }, 3])}`);

            expect(scalar.error?.message).to.contain('Item 2 of');
            expect(fetchStub.called).to.equal(false);
        });

        it('sends an empty array and shows the server refusal', async () => {
            fetchStub = mockFetchSteps([{
                body: { error_code: 'base_error', errors: { hypotheses: ['List should have at least 1 item after validation, not 0'] }, status_code: 400 },
                status: 400,
            }]);

            const { error } = await runCommand(`hypotheses create ${APP} --file ${await fileWith([])}`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({ hypotheses: [] });
            expect(error?.message).to.contain('hypotheses: List should have at least 1 item');
        });

        it('a duplicate gets the server text and the hint to read the open one or force it', async () => {
            fetchStub = mockFetchFailure(
                { error_code: 'hypothesis_duplicate', errors: { 'hypotheses.0': [`An open hypothesis ${ROW} proposes this`] }, status_code: 409 },
                { status: 409 },
            );

            const path = await fileWith({ hypothesis_id: ID });
            const { error } = await runCommand(`hypotheses create ${APP} --file ${path}`);

            expect(error?.message).to.match(new RegExp(`^An open hypothesis ${ROW} proposes this`));
            expect(error?.message).to.contain('Run `adapty hypotheses get --app <app> <id>` to see the open one, or pass --force to create another.');
        });

        it('a different payload under a stored id gets the hint to drop the id or resend the stored payload', async () => {
            fetchStub = mockFetchFailure(
                {
                    error_code: 'hypothesis_payload_conflict',
                    errors: { non_field_errors: [`Hypothesis ${ID} already exists with a different payload`] },
                    status_code: 409,
                },
                { status: 409 },
            );

            const { error } = await runCommand(`hypotheses create ${APP} --file ${await fileWith({ hypothesis_id: ID })}`);

            expect(error?.message).to.contain('already exists with a different payload');
            expect(error?.message).to.contain('Leave hypothesis_id out to create a new hypothesis');
        });
    });

    describe('transitions', () => {
        it('accept with no flags sends {}', async () => {
            fetchStub = mockFetch([hypothesis(accepted)]);

            const { stdout } = await runCommand(`hypotheses accept ${APP} ${ID}`);

            assertFetch({ callIndex: 0, method: 'POST', path: `${BASE}/${ID}/accept/`, stub: fetchStub });
            expect(bodyOf(fetchStub, 0)).to.deep.equal({});
            expect(stdout).to.contain('Allowed Actions: unaccept, dismiss, link, resolve');
        });

        it('accept sends the variant and the product fills', async () => {
            fetchStub = mockFetch([hypothesis({ ...accepted, ...withVariant })]);

            const { stdout } = await runCommand(`hypotheses accept ${APP} ${ID} --variant-flow ${VARIANT} --product ${ROW}=${PRODUCT}`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({
                products: [{ hypothesis_product_id: ROW, product_id: PRODUCT }],
                variant: { variant_flow_id: VARIANT },
            });

            expect(stdout).to.contain(`Variant: flow Plans first (${VARIANT})`);
        });

        it('accept takes the hypothesis id after --product', async () => {
            fetchStub = mockFetch([hypothesis(accepted)]);

            await runCommand(`hypotheses accept ${APP} --product ${ROW}=${PRODUCT} ${ID}`);

            assertFetch({ callIndex: 0, method: 'POST', path: `${BASE}/${ID}/accept/`, stub: fetchStub });

            expect(bodyOf(fetchStub, 0)).to.deep.equal({
                products: [{ hypothesis_product_id: ROW, product_id: PRODUCT }],
            });
        });

        it('accept sends --placement-audience in the variant and shows the audience as the variant', async () => {
            const subject = { country_code: null, flow_id: null, flow_screen_id: null, flow_version_id: null, is_removed: false, paywall_id: null, segment_id: CHILD, title: 'Payers', type: 'audience' };

            fetchStub = mockFetch([hypothesis({
                ...accepted,
                allowed_actions: ['unaccept', 'dismiss', 'resolve'],
                outcome: { id: ROW, is_removed: false, kind: 'placement_audience', title: 'Payers audience' },
                phase: 'applied',
                placement_audience_id: ROW,
                subject,
                type: 'adapty:audience_split',
            })]);

            const { stdout } = await runCommand(`hypotheses accept ${APP} ${ID} --placement-audience ${ROW}`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({ variant: { placement_audience_id: ROW } });
            expect(stdout).to.contain(`Variant: placement audience Payers audience (${ROW})`);
            expect(stdout).not.to.contain('Variant Flow:');
        });

        it('accept of a flow hypothesis shipped without a test sends both and shows the audience and the flow', async () => {
            fetchStub = mockFetch([hypothesis({
                ...accepted,
                allowed_actions: ['unaccept', 'dismiss', 'resolve'],
                outcome: { id: ROW, is_removed: false, kind: 'placement_audience', title: 'All users' },
                phase: 'applied',
                placement_audience_id: ROW,
                variant_flow_id: VARIANT,
            })]);

            const { stdout } = await runCommand(`hypotheses accept ${APP} ${ID} --variant-flow ${VARIANT} --placement-audience ${ROW}`);

            const variant = { placement_audience_id: ROW, variant_flow_id: VARIANT };

            expect(bodyOf(fetchStub, 0)).to.deep.equal({ variant });
            expect(stdout).to.contain(`Variant: placement audience All users (${ROW})`);
            expect(stdout).to.contain(`Variant Flow: ${VARIANT}`);
            expect(stdout).to.contain('Allowed Actions: unaccept, dismiss, resolve');
        });

        it('accept shows the refusal of an audience that does not show the variant flow', async () => {
            fetchStub = mockFetchSteps([{
                body: {
                    error_code: 'placement_audience_content_mismatch',
                    errors: { 'variant.placement_audience_id': [`Placement audience ${ROW} does not show the variant flow ${VARIANT}`] },
                    status_code: 422,
                },
                status: 422,
            }]);

            const command = `hypotheses accept ${APP} ${ID} --variant-flow ${VARIANT} --placement-audience ${ROW}`;
            const { error } = await runCommand(command);

            expect(error?.message).to.contain(`does not show the variant flow ${VARIANT}`);
            expect(fetchStub.callCount).to.equal(1);
        });

        it('accept sends one row filled twice and shows the server refusal', async () => {
            fetchStub = mockFetchSteps([{
                body: { error_code: 'base_error', errors: { products: ['each hypothesis_product_id is filled once'] }, status_code: 400 },
                status: 400,
            }]);

            const { error } = await runCommand(`hypotheses accept ${APP} ${ID} --product ${ROW}=${PRODUCT} --product ${ROW}=${VARIANT}`);

            expect((bodyOf(fetchStub, 0) as { products: unknown[] }).products).to.have.length(2);
            expect(error?.message).to.contain('products: each hypothesis_product_id is filled once');
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.api);
        });

        it('accept refuses a malformed --product with exit 2 before the token is needed', async () => {
            delete process.env.ADAPTY_TOKEN;
            fetchStub = mockFetch([]);

            const { error } = await runCommand(`hypotheses accept ${APP} ${ID} --product ${ROW}`);

            expect(error?.message).to.contain('HYPOTHESIS_PRODUCT_ID=PRODUCT_ID');
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.usage);
            expect(fetchStub.called).to.equal(false);
        });

        it('link refuses an --ab-test that is not a UUID with exit 2 before the token is needed', async () => {
            delete process.env.ADAPTY_TOKEN;
            fetchStub = mockFetch([]);

            const { error } = await runCommand(`hypotheses link ${APP} ${ID} --ab-test nope`);

            expect(error?.message).to.contain('Invalid A/B test ID format');
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.usage);
            expect(fetchStub.called).to.equal(false);
        });

        it('link sends the test id', async () => {
            fetchStub = mockFetch([hypothesis({
                ...accepted,
                ...withVariant,
                ab_test: { id: TEST, is_removed: false, parent_ab_test_id: null, started_at: null, state: 'draft', stopped_at: null, type: 'regular_flow', winner_flow_id: null },
                ab_test_id: TEST,
                allowed_actions: ['unaccept', 'dismiss', 'unlink', 'reorder'],
                phase: 'test_draft',
            })]);

            await runCommand(`hypotheses link ${APP} ${ID} --ab-test ${TEST}`);

            assertFetch({ body: { ab_test_id: TEST }, callIndex: 0, method: 'POST', path: `${BASE}/${ID}/link/`, stub: fetchStub });
        });

        for (const action of ['resolve', 'reresolve']) {
            it(`${action} sends the result with --yes and needs one`, async () => {
                fetchStub = mockFetch([hypothesis({ allowed_actions: [], judged_by: 'user', phase: 'won', resolved_at: '2026-11-13T10:00:00Z', state: 'won' })]);

                const missing = await runCommand(`hypotheses ${action} ${APP} ${ID} --yes`);

                expect(missing.error?.message).to.contain('Missing required flag result');
                expect(fetchStub.called).to.equal(false);

                await runCommand(`hypotheses ${action} ${APP} ${ID} --result won --yes`);

                assertFetch({ body: { result: 'won' }, callIndex: 0, method: 'POST', path: `${BASE}/${ID}/${action}/`, stub: fetchStub });
            });

            it(`${action} without a token says so before it asks`, async () => {
                delete process.env.ADAPTY_TOKEN;
                fetchStub = mockFetch([]);

                const { error } = await runCommand(`hypotheses ${action} ${APP} ${ID} --result lost`);

                expect(error?.oclif?.exit).to.equal(exitCode.auth);
                expect(fetchStub.called).to.equal(false);
            });

            it(`${action} with no terminal and no --yes sends nothing, exit 6`, async () => {
                fetchStub = mockFetch([]);

                const { error } = await runCommand(`hypotheses ${action} ${APP} ${ID} --result lost`);

                expect(error?.message).to.contain(`hypothesis ${ID}`).and.to.contain('lost').and.to.contain('Re-run with --yes');
                expect(error?.oclif?.exit).to.equal(exitCode.confirmRequired);
                expect(fetchStub.called).to.equal(false);
            });
        }

        const endStates: Record<string, Record<string, unknown>> = {
            dismiss: { allowed_actions: ['restore'], phase: 'dismissed', state: 'dismissed' },
            restore: {},
            unaccept: {},
            unlink: { ...accepted, ...withVariant },
        };

        for (const [action, end] of Object.entries(endStates)) {
            it(`${action} posts an empty body to its route`, async () => {
                fetchStub = mockFetch([hypothesis(end)]);

                const { stdout } = await runCommand(`hypotheses ${action} ${APP} ${ID}`);

                assertFetch({ callIndex: 0, method: 'POST', path: `${BASE}/${ID}/${action}/`, stub: fetchStub });
                expect(bodyOf(fetchStub, 0)).to.deep.equal({});
                expect(stdout).to.contain(`ID: ${ID}`);

                if (action === 'unlink') {
                    expect(stdout).to.contain(`Variant: flow Plans first (${VARIANT})`);
                }
            });
        }

        it('an action the row does not allow prints the actions it allows, with no retry', async () => {
            fetchStub = mockFetchSteps([{
                body: { error_code: 'hypothesis_state_conflict', errors: { state: ['Cannot dismiss a hypothesis that is won. Allowed actions: none'] }, status_code: 409 },
                status: 409,
            }]);

            const { error } = await runCommand(`hypotheses dismiss ${APP} ${ID}`);

            expect(error?.message).to.contain('state: Cannot dismiss a hypothesis that is won. Allowed actions: none');
            expect(error?.message).not.to.contain('adapty hypotheses get');
            expect(fetchStub.callCount).to.equal(1);
        });

        it('a test that judges another hypothesis is refused once, with the hint to read it', async () => {
            fetchStub = mockFetchSteps([{
                body: { error_code: 'hypothesis_link_failed', errors: { ab_test_id: [`The A/B test already judges hypothesis ${ROW}`] }, status_code: 409 },
                status: 409,
            }]);

            const { error } = await runCommand(`hypotheses link ${APP} ${ID} --ab-test ${TEST}`);

            expect(error?.message).to.contain(`ab_test_id: The A/B test already judges hypothesis ${ROW}`);
            expect(error?.message).to.contain('Run `adapty hypotheses by-ab-test --app <app> <ab_test_id>`');
            expect(fetchStub.callCount).to.equal(1);
        });

        it('link to an unknown test is a field error, exit 4, sent once', async () => {
            fetchStub = mockFetchSteps([{
                body: { error_code: 'ab_test_id_not_found', errors: { ab_test_id: [`ab_test_id ${TEST} not found`] }, status_code: 422 },
                status: 422,
            }]);

            const { error } = await runCommand(`hypotheses link ${APP} ${ID} --ab-test ${TEST}`);

            expect(error?.message).to.contain(`ab_test_id: ab_test_id ${TEST} not found`);
            expect((error as { exitCode?: number } | undefined)?.exitCode).to.equal(exitCode.api);
            expect(fetchStub.callCount).to.equal(1);
        });

        it('a test with other arms points at the arms and at unaccept', async () => {
            fetchStub = mockFetchSteps([{
                body: { error_code: 'hypothesis_variant_mismatch', errors: { non_field_errors: ['The A/B test must compare exactly the hypothesis flow and its variant flow'] }, status_code: 409 },
                status: 409,
            }]);

            const { error } = await runCommand(`hypotheses link ${APP} ${ID} --ab-test ${TEST}`);

            expect(error?.message).to.contain('must compare exactly the hypothesis flow and its variant flow');
            expect(error?.message).to.contain('Check the arms with `adapty ab-tests get --app <app> <ab_test_id>`');
            expect(fetchStub.callCount).to.equal(1);
        });

        it('accept refuses a malformed --placement-audience and says where the id is', async () => {
            delete process.env.ADAPTY_TOKEN;
            fetchStub = mockFetch([]);

            const { error } = await runCommand(`hypotheses accept ${APP} ${ID} --placement-audience nope`);

            expect(error?.message).to.contain('the Placement Audience ID of an audience in `adapty placements get --app <app> <placement_id>`');
            expect(fetchStub.called).to.equal(false);
        });

        it('--json prints the row as the server sent it, reorder included', async () => {
            fetchStub = mockFetch([hypothesis()]);

            const { stdout } = await runCommand(`hypotheses restore ${APP} ${ID} --json`);

            expect((JSON.parse(stdout) as { allowed_actions: string[] }).allowed_actions).to.deep.equal(['accept', 'dismiss', 'reorder']);
        });
    });
});
