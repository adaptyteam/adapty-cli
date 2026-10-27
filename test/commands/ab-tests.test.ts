import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { run } from '@oclif/core';
import { captureOutput } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { assertFetch, mockFetch, mockFetchSteps, restoreFetch, TEST_APP_ID, TEST_RESOURCE_ID } from '../helpers/mock-fetch.js';

import type * as sinon from 'sinon';

const ROOT = join(import.meta.dirname, '..', '..');

/**
 * `runCommand` splits a line on double quotes only, and the arms are JSON: a line is split here the
 * way a shell does, single and double quotes both.
 */
const words = (line: string): string[] =>
    [...line.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3] ?? '');

const runCommand = (args: string | string[]) =>
    captureOutput(async () => run(Array.isArray(args) ? args : words(args), { root: ROOT }));

/** Under --json oclif prints the error as JSON and sets the process exit code instead of throwing. */
type JsonRun = { error: { code: string; message: string }; exit: null | number | string | undefined };

const runJson = async (args: string): Promise<JsonRun> => {
    process.exitCode = undefined;

    const { stdout } = await runCommand(args);
    const exit = process.exitCode;

    process.exitCode = undefined;

    return { error: (JSON.parse(stdout) as { error: { code: string; message: string } }).error, exit };
};

const TEST = TEST_RESOURCE_ID;
const PLACEMENT = '770e8400-e29b-41d4-a716-446655440002';
const SEGMENT = '880e8400-e29b-41d4-a716-446655440003';
const PAYWALL_A = '990e8400-e29b-41d4-a716-446655440004';
const PAYWALL_B = 'aa0e8400-e29b-41d4-a716-446655440005';
const FLOW_A = 'bb0e8400-e29b-41d4-a716-446655440006';
const FLOW_B = 'cc0e8400-e29b-41d4-a716-446655440007';
const REPLACEMENT = 'dd0e8400-e29b-41d4-a716-446655440008';
const BASE = `/apps/${TEST_APP_ID}/ab-tests`;
const APP = `--app ${TEST_APP_ID}`;

const abTest = (overrides: Record<string, unknown> = {}) => ({
    ab_test_id: TEST,
    flows: [],
    goal: 'Find the price',
    paywalls: [
        { paywall_id: PAYWALL_A, paywall_title: 'Default', title: 'A', variation_id: 'v1', weight: 50 },
        { paywall_id: PAYWALL_B, paywall_title: 'Spare', title: null, variation_id: 'v2', weight: 50 },
    ],
    placement: { placement_id: PLACEMENT, title: 'Main' },
    priority: 0,
    segment_ids: [SEGMENT],
    started_at: '2026-10-20T10:00:00Z',
    state: 'live',
    stopped_at: null,
    title: 'Price test',
    type: 'paywall',
    ...overrides,
});

const flowTest = (overrides: Record<string, unknown> = {}) => abTest({
    flows: [{ flow_id: FLOW_A, flow_name: 'Flow A', title: null, variation_id: 'v1', weight: 50 }],
    paywalls: [],
    type: 'flow',
    ...overrides,
});

const PAYWALL_LIST = [{ paywall_id: PAYWALL_A, weight: 50 }, { paywall_id: PAYWALL_B, title: 'B', weight: 50 }];
const FLOW_LIST = [{ flow_id: FLOW_A, weight: 50 }, { flow_id: FLOW_B, weight: 50 }];
const PAYWALL_ARMS = JSON.stringify(PAYWALL_LIST);
const FLOW_ARMS = JSON.stringify(FLOW_LIST);

const methods = (stub: sinon.SinonStub): string[] =>
    stub.getCalls().map(call => (call.args[1] as { method: string }).method);

const bodyOf = (stub: sinon.SinonStub, index: number): unknown =>
    JSON.parse((stub.getCall(index).args[1] as { body: string }).body);

/**
 * Whether a person is at a terminal is decided by the real streams, so a test says it for itself: a
 * run from a developer's terminal must not stop at a prompt. Node deletes isTTY on a pipe rather
 * than setting it false, so the property is put back the way it was found.
 */
const useStreams = ({ terminal, typed }: { terminal: boolean; typed?: string }): (() => void) => {
    const stdout = process.stdout as { isTTY?: boolean | undefined };
    const hadStdout = Object.hasOwn(stdout, 'isTTY');
    const wasTty = stdout.isTTY;
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    const input = Object.assign(new PassThrough(), { isTTY: terminal });

    stdout.isTTY = terminal;
    input.end(typed === undefined ? undefined : `${typed}\n`);
    Object.defineProperty(process, 'stdin', { configurable: true, value: input });

    return () => {
        if (hadStdout) {
            stdout.isTTY = wasTty;
        } else {
            delete stdout.isTTY;
        }

        if (stdinDescriptor) {
            Object.defineProperty(process, 'stdin', stdinDescriptor);
        }
    };
};

/** A person at a terminal who types `typed`. */
const withTerminal = async (typed: string, body: () => Promise<void>): Promise<void> => {
    const restore = useStreams({ terminal: true, typed });

    try {
        await body();
    } finally {
        restore();
    }
};

describe('ab-tests', () => {
    let fetchStub: sinon.SinonStub;

    let restoreStreams: () => void;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
        restoreStreams = useStreams({ terminal: false });
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        restoreStreams();
        delete process.env.ADAPTY_TOKEN;
    });

    describe('list and get', () => {
        const page = { data: [abTest()], meta: { pagination: { count: 1, page: 1, pages: 1 } } };

        it('list asks for flow tests and the first page by default', async () => {
            fetchStub = mockFetch([page]);

            await runCommand(`ab-tests list ${APP}`);

            assertFetch({
                callIndex: 0,
                method: 'GET',
                path: `${BASE}/`,
                query: { 'page[number]': '1', 'page[size]': '20', 'type': 'flow' },
                stub: fetchStub,
            });
        });

        it('list passes every filter on, and prints a block for each test', async () => {
            fetchStub = mockFetch([page]);

            const { stdout } = await runCommand(
                `ab-tests list ${APP} --type paywall --state live --placement ${PLACEMENT} --search price --page 2 --page-size 5`,
            );

            assertFetch({
                callIndex: 0,
                method: 'GET',
                path: `${BASE}/`,
                query: {
                    'filter[placement_id]': PLACEMENT,
                    'filter[search]': 'price',
                    'filter[state]': 'live',
                    'page[number]': '2',
                    'page[size]': '5',
                    'type': 'paywall',
                },
                stub: fetchStub,
            });

            expect(stdout).to.contain(`ID: ${TEST}`).and.to.contain('Type: paywall').and.to.contain('State: live');
            expect(stdout).to.contain(`Placement: Main (${PLACEMENT})`).and.to.contain(`Audience: segment ${SEGMENT}`);
            expect(stdout).to.contain('Started At: 2026-10-20T10:00:00Z').and.to.contain('Stopped At: —');
            expect(stdout).to.contain('Page 1 of 1 (1 total)');
        });

        it('list sends repeated --placement and --segment as comma separated ids', async () => {
            const placementB = 'ee0e8400-e29b-41d4-a716-446655440009';
            const segmentB = 'ff0e8400-e29b-41d4-a716-44665544000a';

            fetchStub = mockFetch([page]);

            await runCommand(`ab-tests list ${APP} --placement ${PLACEMENT} --placement ${placementB} --segment ${SEGMENT} --segment ${segmentB}`);

            assertFetch({
                callIndex: 0,
                method: 'GET',
                path: `${BASE}/`,
                query: {
                    'filter[placement_id]': `${PLACEMENT},${placementB}`,
                    'filter[segment_id]': `${SEGMENT},${segmentB}`,
                    'page[number]': '1',
                    'page[size]': '20',
                    'type': 'flow',
                },
                stub: fetchStub,
            });
        });

        it('list --json prints the answer as it came', async () => {
            fetchStub = mockFetch([page]);

            const { stdout } = await runCommand(`ab-tests list ${APP} --json`);

            expect(JSON.parse(stdout)).to.deep.equal(page);
        });

        it('list refuses a state or a type that does not exist, with no request', async () => {
            fetchStub = mockFetch();

            const { error } = await runCommand(`ab-tests list ${APP} --state paused`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('Expected --state=paused to be one of');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('get shows the test and its arms', async () => {
            fetchStub = mockFetch([abTest()]);

            const { stdout } = await runCommand(`ab-tests get ${APP} ${TEST}`);

            assertFetch({ callIndex: 0, method: 'GET', path: `${BASE}/${TEST}/`, stub: fetchStub });
            expect(stdout).to.contain('Goal: Find the price').and.to.contain('Arms:');
            expect(stdout).to.contain(`Default (${PAYWALL_A}), weight 50, title A, variation v1`);
            expect(stdout).to.contain(`Spare (${PAYWALL_B}), weight 50, variation v2`);
        });

        it('shows an arm of a new draft, whose variation is not known yet', async () => {
            fetchStub = mockFetch([abTest({
                paywalls: [{ paywall_id: PAYWALL_A, paywall_title: 'Default', title: 'A', variation_id: null, weight: 100 }],
                state: 'draft',
            })]);

            const { stdout } = await runCommand(`ab-tests get ${APP} ${TEST}`);

            expect(stdout).to.contain(`Default (${PAYWALL_A}), weight 100, title A`).and.not.to.contain('variation');
        });

        it('get shows a draft with no placement and no audience', async () => {
            fetchStub = mockFetch([abTest({ placement: null, priority: null, segment_ids: null, started_at: null, state: 'draft' })]);

            const { stdout } = await runCommand(`ab-tests get ${APP} ${TEST}`);

            expect(stdout).to.contain('Placement: —').and.to.contain('Audience: —').and.to.contain('State: draft');
            expect(stdout).not.to.contain('Priority');
        });

        it('get shows All users for an empty segment list', async () => {
            fetchStub = mockFetch([flowTest({ segment_ids: [] })]);

            const { stdout } = await runCommand(`ab-tests get ${APP} ${TEST}`);

            expect(stdout).to.contain('Audience: All users').and.to.contain(`Flow A (${FLOW_A})`);
        });

        it('refuses an ID that is not a UUID, with no request', async () => {
            fetchStub = mockFetch();

            const { error } = await runCommand(`ab-tests get ${APP} nope`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('Invalid A/B test ID format');
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('create and update', () => {
        it('create sends a paywall test, and never asks', async () => {
            fetchStub = mockFetch([abTest({ state: 'draft' })]);

            const { error, stdout } = await runCommand(
                ['ab-tests', 'create', '--app', TEST_APP_ID, '--title', 'Price test', '--placement', PLACEMENT, '--paywalls', PAYWALL_ARMS],
            );

            expect(error).to.equal(undefined);

            assertFetch({
                body: { goal: '', paywalls: PAYWALL_LIST, placement_id: PLACEMENT, title: 'Price test' },
                callIndex: 0,
                method: 'POST',
                path: `${BASE}/`,
                stub: fetchStub,
            });

            expect(bodyOf(fetchStub, 0)).not.to.have.property('segment_ids');
            expect(stdout).to.contain('State: draft');
        });

        it('create sends a flow test with the goal', async () => {
            fetchStub = mockFetch([flowTest({ state: 'draft' })]);

            await runCommand(['ab-tests', 'create', '--app', TEST_APP_ID, '--title', 'Flows', '--goal', 'More trials', '--placement', PLACEMENT, '--flows', FLOW_ARMS]);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({
                flows: FLOW_LIST,
                goal: 'More trials',
                placement_id: PLACEMENT,
                title: 'Flows',
            });
        });

        it('create sends --segment as one id and --all-users as an empty list', async () => {
            fetchStub = mockFetch([abTest()]);

            await runCommand(['ab-tests', 'create', '--app', TEST_APP_ID, '--title', 'T', '--placement', PLACEMENT, '--paywalls', PAYWALL_ARMS, '--segment', SEGMENT]);
            await runCommand(['ab-tests', 'create', '--app', TEST_APP_ID, '--title', 'T', '--placement', PLACEMENT, '--paywalls', PAYWALL_ARMS, '--all-users']);

            expect((bodyOf(fetchStub, 0) as { segment_ids: string[] }).segment_ids).to.deep.equal([SEGMENT]);
            expect((bodyOf(fetchStub, 1) as { segment_ids: string[] }).segment_ids).to.deep.equal([]);
        });

        const refused: [string, string, string][] = [
            ['neither arms flag', `--title T`, 'Exactly one of the following must be provided: --flows, --paywalls'],
            ['both arms flags', `--title T --paywalls '${PAYWALL_ARMS}' --flows '${FLOW_ARMS}'`, 'cannot also be provided'],
            ['--segment with --all-users', `--title T --paywalls '${PAYWALL_ARMS}' --segment ${SEGMENT} --all-users`, 'cannot also be provided'],
            ['arms that are not JSON', `--title T --paywalls nope`, 'The arms are not valid JSON'],
            ['arms that are not a list', `--title T --paywalls '{"paywall_id":"x"}'`, 'The arms must be a JSON array'],
            ['an arm with no weight', `--title T --paywalls '[{"paywall_id":"x"}]'`, 'Arm 1 needs "paywall_id" (a string) and "weight"'],
            ['a flow id in --paywalls', `--title T --paywalls '[{"flow_id":"x","weight":100}]'`, 'Arm 1 needs "paywall_id"'],
            ['a segment that is not a UUID', `--title T --paywalls '${PAYWALL_ARMS}' --segment nope`, 'Invalid segment ID format'],
        ];

        for (const [name, args, message] of refused) {
            it(`create refuses ${name}, with no request`, async () => {
                fetchStub = mockFetch();

                const { error } = await runCommand(`ab-tests create ${APP} --placement ${PLACEMENT} ${args}`);

                expect(error?.oclif?.exit).to.equal(exitCode.usage);
                expect(error?.message).to.contain(message);
                expect(fetchStub.callCount).to.equal(0);
            });
        }

        it('create needs a placement, with no request', async () => {
            fetchStub = mockFetch();

            const { error } = await runCommand(`ab-tests create ${APP} --title T --paywalls '${PAYWALL_ARMS}'`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('Missing required flag placement');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('create shows the backend text when the weights are wrong (exit 4)', async () => {
            fetchStub = mockFetchSteps([{
                body: { errors: { non_field_errors: ['The sum of the weights must equal 100, but has 90.'] }, error_code: 'validation_error' },
                status: 400,
            }]);

            const { error } = await runCommand(['ab-tests', 'create', '--app', TEST_APP_ID, '--title', 'T', '--placement', PLACEMENT, '--paywalls', PAYWALL_ARMS]);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.contain('The sum of the weights must equal 100, but has 90.');
        });

        // The input rule comes before the token, the read and the question
        for (const command of ['create', 'update', 'replace']) {
            it(`${command} refuses a blank title with exit 2 before any request, even with no token`, async () => {
                delete process.env.ADAPTY_TOKEN;
                fetchStub = mockFetch();

                const id = command === 'create' ? '' : TEST;

                const { error } = await runCommand(
                    `ab-tests ${command} ${APP} ${id} --title " " --placement ${PLACEMENT} --paywalls '${PAYWALL_ARMS}'${command === 'replace' ? ' --yes' : ''}`,
                );

                expect(error?.oclif?.exit).to.equal(exitCode.usage);
                expect(error?.message).to.contain('--title: must not be empty');
                expect(fetchStub.callCount).to.equal(0);
            });
        }

        it('update sends the whole test with PUT, and never asks', async () => {
            fetchStub = mockFetch([abTest()]);

            const { error } = await runCommand(
                ['ab-tests', 'update', '--app', TEST_APP_ID, TEST, '--title', 'Price test (Q4)', '--placement', PLACEMENT, '--paywalls', PAYWALL_ARMS],
            );

            expect(error).to.equal(undefined);

            assertFetch({
                body: { goal: '', placement_id: PLACEMENT, title: 'Price test (Q4)' },
                callIndex: 0,
                method: 'PUT',
                path: `${BASE}/${TEST}/`,
                stub: fetchStub,
            });

            expect(fetchStub.callCount).to.equal(1);
        });
    });

    describe('start', () => {
        const start = `ab-tests start ${APP} ${TEST} --placement ${PLACEMENT}`;
        const draft = abTest({ placement: null, priority: null, segment_ids: null, started_at: null, state: 'draft' });

        it('reads the test, then writes with --yes: one segment', async () => {
            fetchStub = mockFetch([draft, abTest()]);

            const { error, stdout } = await runCommand(`${start} --segment ${SEGMENT} --yes`);

            expect(error).to.equal(undefined);
            expect(methods(fetchStub)).to.deep.equal(['GET', 'POST']);
            assertFetch({ callIndex: 0, method: 'GET', path: `${BASE}/${TEST}/`, stub: fetchStub });

            assertFetch({
                body: { placement_id: PLACEMENT, segment_ids: [SEGMENT] },
                callIndex: 1,
                method: 'POST',
                path: `${BASE}/${TEST}/start/`,
                stub: fetchStub,
            });

            expect(stdout).to.contain('State: live');
        });

        it('--all-users is an empty list', async () => {
            fetchStub = mockFetch([draft, abTest()]);

            await runCommand(`${start} --all-users -y`);

            expect(bodyOf(fetchStub, 1)).to.deep.equal({ placement_id: PLACEMENT, segment_ids: [] });
        });

        it('--json with no --yes writes nothing: exit 6, confirm_required, the effect', async () => {
            fetchStub = mockFetch([draft, abTest()]);

            const { error: { code, message }, exit } = await runJson(`${start} --segment ${SEGMENT} --json`);

            expect(exit).to.equal(exitCode.confirmRequired);
            expect(code).to.equal('confirm_required');
            expect(message).to.contain(`Start A/B test "Price test" on placement ${PLACEMENT} for segment ${SEGMENT}.`);
            expect(message).to.contain('You cannot undo a start.').and.to.contain('Re-run with --yes to do it.');
            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('with no terminal and no --yes writes nothing: exit 6 on stderr', async () => {
            fetchStub = mockFetch([draft, abTest()]);

            const { error } = await runCommand(`${start} --all-users`);

            expect(error?.oclif?.exit).to.equal(exitCode.confirmRequired);
            expect(error?.message).to.contain('for All users.').and.to.contain('Re-run with --yes');
            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('refuses neither audience flag, both, and a missing placement, with no request', async () => {
            fetchStub = mockFetch();

            for (const [args, message] of [
                [start, 'Exactly one of the following must be provided: --all-users, --segment'],
                [`${start} --segment ${SEGMENT} --all-users`, 'cannot also be provided'],
                [`ab-tests start ${APP} ${TEST} --all-users`, 'Missing required flag placement'],
            ]) {
                const { error } = await runCommand(args ?? '');

                expect(error?.oclif?.exit, args).to.equal(exitCode.usage);
                expect(error?.message, args).to.contain(message);
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('at a terminal shows the question; "n" writes nothing and exits 1', async () => {
            fetchStub = mockFetch([draft, abTest()]);

            await withTerminal('n', async () => {
                const { error, stderr } = await runCommand(`${start} --all-users`);

                expect(error?.oclif?.exit).to.equal(1);
                expect(error?.message).to.equal('Cancelled, nothing was sent.');
                expect(stderr).to.contain('Apply? [y/N]');
            });

            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('at a terminal "y" writes', async () => {
            fetchStub = mockFetch([draft, abTest()]);

            await withTerminal('y', async () => {
                const { error } = await runCommand(`${start} --all-users`);

                expect(error).to.equal(undefined);
            });

            expect(methods(fetchStub)).to.deep.equal(['GET', 'POST']);
        });
    });

    describe('stop', () => {
        const stop = `ab-tests stop ${APP} ${TEST}`;
        const completed = (overrides: Record<string, unknown> = {}) => abTest({ state: 'completed', stopped_at: '2026-10-21T10:00:00Z', ...overrides });

        // The server names the content kind in the field: the type from the read picks it
        const bodies: [string, Record<string, unknown>, string, unknown][] = [
            ['paywall winner', abTest(), `--winner ${PAYWALL_B}`, { winner_paywall_id: PAYWALL_B }],
            ['flow winner', flowTest(), `--winner ${FLOW_A}`, { winner_flow_id: FLOW_A }],
            ['paywall other', abTest(), `--other ${PAYWALL_A}`, { another_paywall_id_to_run: PAYWALL_A }],
            ['flow other', flowTest(), `--other ${FLOW_B}`, { another_flow_id_to_run: FLOW_B }],
            ['paywall no content', abTest(), '--no-content', {}],
            ['flow no content', flowTest(), '--no-content', {}],
        ];

        for (const [name, read, flags, expected] of bodies) {
            it(`sends the ${name} field`, async () => {
                fetchStub = mockFetch([read, completed({ type: read.type })]);

                const { error } = await runCommand(`${stop} ${flags} --yes`);

                expect(error).to.equal(undefined);
                assertFetch({ callIndex: 1, method: 'POST', path: `${BASE}/${TEST}/stop/`, stub: fetchStub });
                expect(bodyOf(fetchStub, 1)).to.deep.equal(expected);
            });
        }

        it('prints the stop line, then the test', async () => {
            fetchStub = mockFetch([abTest(), completed()]);

            const { stdout } = await runCommand(`${stop} --winner ${PAYWALL_B} --yes`);

            expect(stdout.split('\n')[0]).to.equal(`Stopped A/B test "Price test": all users of its audience see ${PAYWALL_B} from now on.`);
            expect(stdout).to.contain('State: completed');
        });

        it('prints the removal for no content', async () => {
            fetchStub = mockFetch([abTest(), completed()]);

            const { stdout } = await runCommand(`${stop} --no-content --yes`);

            expect(stdout).to.contain('Stopped A/B test "Price test": the audience is removed from the placement.');
        });

        it('refuses --no-content on All users before the question, with no write (exit 4)', async () => {
            fetchStub = mockFetch([abTest({ segment_ids: [] }), completed()]);

            const { error } = await runCommand(`${stop} --no-content`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.equal('AB Test from default audience can not be stopped.');
            expect(methods(fetchStub)).to.deep.equal(['GET']);

            // The same shape as the server's own refusal, so --json readers see one error
            fetchStub.restore();
            fetchStub = mockFetch([abTest({ segment_ids: [] })]);

            const json = await runJson(`${stop} --no-content --json`);

            expect(json.exit).to.equal(exitCode.api);

            expect(json.error).to.include({
                code: 'validation_error',
                error_code: 'validation_error',
                message: 'AB Test from default audience can not be stopped.',
                status: 400,
                status_code: 400,
            }).and.to.deep.include({ errors: { non_field_errors: ['AB Test from default audience can not be stopped.'] } });
        });

        it('without --yes under --json writes nothing: exit 6 with the effect', async () => {
            fetchStub = mockFetch([abTest(), completed()]);

            const { error, exit } = await runJson(`${stop} --no-content --json`);

            expect(exit).to.equal(exitCode.confirmRequired);

            expect(error.message)
                .to.contain('The audience is removed from the placement')
                .and.to.contain('The test becomes completed.');

            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('refuses none or two of winner, other and no-content, with no request', async () => {
            fetchStub = mockFetch();

            for (const [args, message] of [
                [stop, 'Exactly one of the following must be provided: --no-content, --other, --winner'],
                [`${stop} --winner ${PAYWALL_A} --other ${PAYWALL_B}`, 'cannot also be provided'],
                [`${stop} --winner ${PAYWALL_A} --no-content`, 'cannot also be provided'],
            ]) {
                const { error } = await runCommand(args ?? '');

                expect(error?.oclif?.exit, args).to.equal(exitCode.usage);
                expect(error?.message, args).to.contain(message);
            }

            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('replace', () => {
        const replace = `ab-tests replace ${APP} ${TEST} --title "Price test v2" --placement ${PLACEMENT}`;

        it('reads the test, then posts the new one, and says which test replaces which', async () => {
            fetchStub = mockFetch([abTest(), abTest({ ab_test_id: REPLACEMENT, title: 'Price test v2' })]);

            const { error, stdout } = await runCommand(['ab-tests', 'replace', '--app', TEST_APP_ID, TEST, '--title', 'Price test v2', '--placement', PLACEMENT, '--paywalls', PAYWALL_ARMS, '--yes']);

            expect(error).to.equal(undefined);
            assertFetch({ callIndex: 1, method: 'POST', path: `${BASE}/${TEST}/replace/`, stub: fetchStub });

            expect(bodyOf(fetchStub, 1)).to.deep.equal({
                goal: '',
                paywalls: PAYWALL_LIST,
                placement_id: PLACEMENT,
                title: 'Price test v2',
            });

            expect(stdout.split('\n')[0]).to.equal(`New test ${REPLACEMENT} replaces ${TEST} (now completed).`);
        });

        it('without --yes under --json writes nothing: exit 6 with the effect', async () => {
            fetchStub = mockFetch([abTest()]);

            const { error, exit } = await runJson(`ab-tests replace ${APP} ${TEST} --title v2 --placement ${PLACEMENT} --flows '${FLOW_ARMS}' --json`);

            expect(exit).to.equal(exitCode.confirmRequired);

            expect(error.message)
                .to.contain('Replace A/B test "Price test" with a new test.')
                .and.to.contain('every user of the audience gets a new draw');

            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('has no audience flag, needs a placement and one arms flag, with no request', async () => {
            fetchStub = mockFetch();

            for (const [args, message] of [
                [`${replace} --paywalls '${PAYWALL_ARMS}' --segment ${SEGMENT}`, 'Nonexistent flag: --segment'],
                [`${replace} --paywalls '${PAYWALL_ARMS}' --all-users`, 'Nonexistent flag: --all-users'],
                [`ab-tests replace ${APP} ${TEST} --title T --paywalls '${PAYWALL_ARMS}'`, 'Missing required flag placement'],
                [replace, 'Exactly one of the following must be provided: --flows, --paywalls'],
            ]) {
                const { error } = await runCommand(args ?? '');

                expect(error?.oclif?.exit, args).to.equal(exitCode.usage);
                expect(error?.message, args).to.contain(message);
            }

            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('archive', () => {
        const archive = `ab-tests archive ${APP} ${TEST}`;

        it('reads the test, deletes it with --yes, and prints the archived line, then the test', async () => {
            fetchStub = mockFetch([abTest({ state: 'completed' }), abTest({ state: 'archived' })]);

            const { error, stdout } = await runCommand(`${archive} --yes`);

            expect(error).to.equal(undefined);
            assertFetch({ callIndex: 1, method: 'DELETE', path: `${BASE}/${TEST}/`, stub: fetchStub });
            expect(stdout.split('\n')[0]).to.equal('Archived A/B test "Price test".');
            expect(stdout).to.contain('State: archived');
        });

        it('without --yes under --json writes nothing: exit 6 with the dashboard text', async () => {
            fetchStub = mockFetch([abTest({ state: 'completed' })]);

            const { error, exit } = await runJson(`${archive} --json`);

            expect(exit).to.equal(exitCode.confirmRequired);

            expect(error.message)
                .to.contain('Archive A/B test "Price test"? Once archived, A/B test cannot be unarchived.');

            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('shows the backend refusal of a live test (exit 4)', async () => {
            fetchStub = mockFetchSteps([
                { body: abTest() },
                { body: { errors: { non_field_errors: ['Live Ab Test can not be deleted.'] }, error_code: 'validation_error' }, status: 400 },
            ]);

            const { error } = await runCommand(`${archive} --yes`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.contain('Live Ab Test can not be deleted.');
        });
    });
});
