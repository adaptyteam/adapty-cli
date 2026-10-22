import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    mockFetch,
    mockFetchFailure,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const PLACEMENT_RESPONSE = { developer_id: 'default', id: TEST_RESOURCE_ID, is_active: true, title: 'Default' };
const PAYWALL_ID = '770e8400-e29b-41d4-a716-446655440002';
const SEGMENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const FLOW_ID = '990e8400-e29b-41d4-a716-446655440004';
const TEST_ID = 'bb0e8400-e29b-41d4-a716-446655440006';
const CROSS_TEST_ID = 'dd0e8400-e29b-41d4-a716-446655440008';

// The placement as `placements get` shows it: a running test on a segment, the default paywall, a crossplacement test
const AB_AUDIENCES = [
    { ab_test_id: TEST_ID, ab_test_title: 'Live paywall test', content_type: 'ab_test', priority: 0, segment_ids: [SEGMENT_ID] },
    { content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 1, segment_ids: [] },
    { ab_test_id: CROSS_TEST_ID, ab_test_title: 'Cross test', content_type: 'cross_ab_test', priority: 2, segment_ids: [] },
];

const writeArgs = (command: 'create' | 'update', audiences: unknown[]): string[] => [
    'placements',
    command,
    ...(command === 'update' ? [TEST_RESOURCE_ID] : []),
    '--app',
    TEST_APP_ID,
    '--title',
    'Default',
    '--developer-id',
    'default',
    '--audiences',
    JSON.stringify(audiences),
];

describe('placements', () => {
    let fetchStub: sinon.SinonStub;

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET /apps/{app}/placements and surfaces is_active', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';

        fetchStub = mockFetch([{
            data: [{ ...PLACEMENT_RESPONSE, is_active: false }],
            meta: { pagination: { count: 1, page: 1, pages: 1 } },
        }]);

        const { stdout } = await runCommand(`placements list --app ${TEST_APP_ID}`);

        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/placements/`, stub: fetchStub });

        if (!stdout.includes('Is Active: false')) {
            throw new Error(`Expected "Is Active: false" in output, got: ${stdout}`);
        }
    });

    it('get calls GET /apps/{app}/placements/{id} and surfaces is_active', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';

        fetchStub = mockFetch([
            {
                ...PLACEMENT_RESPONSE,
                audiences: [{ content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 0, segment_ids: [] }],
            },
        ]);

        const { stdout } = await runCommand(`placements get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);

        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`, stub: fetchStub });

        if (!stdout.includes('Is Active: true')) {
            throw new Error(`Expected "Is Active: true" in output, got: ${stdout}`);
        }
    });

    it('create with --paywall-id sends paywall_id directly', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PLACEMENT_RESPONSE]);
        await runCommand(`placements create --app ${TEST_APP_ID} --title Default --developer-id default --paywall-id ${PAYWALL_ID}`);

        assertFetch({
            body: {
                audiences: null,
                developer_id: 'default',
                paywall_id: PAYWALL_ID,
                title: 'Default',
            },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/placements/`,
            stub: fetchStub,
        });
    });

    it('create with --audiences sends JSON verbatim', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PLACEMENT_RESPONSE]);

        const audiences = [
            { content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 0, segment_ids: [SEGMENT_ID] },
            { content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 1, segment_ids: [] },
        ];

        await runCommand([
            'placements',
            'create',
            '--app',
            TEST_APP_ID,
            '--title',
            'Default',
            '--developer-id',
            'default',
            '--audiences',
            JSON.stringify(audiences),
        ]);

        assertFetch({
            body: { audiences, developer_id: 'default', paywall_id: null, title: 'Default' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/placements/`,
            stub: fetchStub,
        });
    });

    it('create with a flow audience sends content_type and flow_id', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PLACEMENT_RESPONSE]);

        const audiences = [{ content_type: 'flow', flow_id: FLOW_ID, priority: 0, segment_ids: [] }];

        await runCommand([
            'placements',
            'create',
            '--app',
            TEST_APP_ID,
            '--title',
            'Default',
            '--developer-id',
            'default',
            '--audiences',
            JSON.stringify(audiences),
        ]);

        assertFetch({
            body: { audiences, developer_id: 'default', paywall_id: null, title: 'Default' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/placements/`,
            stub: fetchStub,
        });
    });

    it('update with a flow audience sends content_type and flow_id', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PLACEMENT_RESPONSE]);

        const audiences = [{ content_type: 'flow', flow_id: FLOW_ID, priority: 0, segment_ids: [] }];

        await runCommand([
            'placements',
            'update',
            TEST_RESOURCE_ID,
            '--app',
            TEST_APP_ID,
            '--title',
            'Default',
            '--developer-id',
            'default',
            '--audiences',
            JSON.stringify(audiences),
        ]);

        assertFetch({
            body: { audiences, developer_id: 'default', paywall_id: null, title: 'Default' },
            callIndex: 0,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('create rejects an audience entry without content_type and makes no HTTP call', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PLACEMENT_RESPONSE]);

        const audiences = [{ paywall_id: PAYWALL_ID, priority: 0, segment_ids: [] }];

        const { error } = await runCommand([
            'placements',
            'create',
            '--app',
            TEST_APP_ID,
            '--title',
            'Default',
            '--developer-id',
            'default',
            '--audiences',
            JSON.stringify(audiences),
        ]);

        const exit = (error as undefined | { oclif?: { exit?: number } })?.oclif?.exit;

        if (exit !== 2) {
            throw new Error(`Expected exit code 2, got ${exit}`);
        }

        if (fetchStub.callCount !== 0) {
            throw new Error(`Expected no HTTP call, got ${fetchStub.callCount}`);
        }
    });

    it('create enriches the draft-flow 400 with publish steps and the flow id', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';

        fetchStub = mockFetchFailure(
            {
                error_code: 'validation_error',
                errors: { non_field_errors: ['Flow must be published before placing in a placement.'] },
                status_code: 400,
            },
            { status: 400 },
        );

        const audiences = [{ content_type: 'flow', flow_id: FLOW_ID, priority: 0, segment_ids: [] }];

        const { error } = await runCommand([
            'placements',
            'create',
            '--app',
            TEST_APP_ID,
            '--title',
            'Default',
            '--developer-id',
            'default',
            '--audiences',
            JSON.stringify(audiences),
        ]);

        const exit = (error as undefined | { oclif?: { exit?: number } })?.oclif?.exit;

        if (exit === 0 || exit === undefined) {
            throw new Error(`Expected non-zero exit, got ${exit}`);
        }

        const { message } = error as Error;

        for (const needle of [
            `adapty flows publish --app ${TEST_APP_ID} ${FLOW_ID}`,
            `https://app.adapty.io/flows/${FLOW_ID}/builder`,
            'https://adapty.io/docs/flow-generator-skill',
        ]) {
            if (!message.includes(needle)) {
                throw new Error(`Expected "${needle}" in error, got: ${message}`);
            }
        }
    });

    it('create relays a different 400 unchanged, with no publish steps', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';

        fetchStub = mockFetchFailure(
            {
                error_code: 'validation_error',
                errors: { audiences: ['Audiences must not mix flow and paywall content types.'] },
                status_code: 400,
            },
            { status: 400 },
        );

        const audiences = [{ content_type: 'flow', flow_id: FLOW_ID, priority: 0, segment_ids: [] }];

        const { error } = await runCommand([
            'placements',
            'create',
            '--app',
            TEST_APP_ID,
            '--title',
            'Default',
            '--developer-id',
            'default',
            '--audiences',
            JSON.stringify(audiences),
        ]);

        if (error === undefined) {
            throw new Error('Expected the command to fail');
        }

        const { message } = error as Error;

        if (message.includes('adapty flows publish')) {
            throw new Error(`Expected no publish steps, got: ${message}`);
        }
    });

    it('update with --paywall-id sends paywall_id directly', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PLACEMENT_RESPONSE]);
        await runCommand(`placements update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title Default --developer-id default --paywall-id ${PAYWALL_ID}`);

        assertFetch({
            body: {
                audiences: null,
                developer_id: 'default',
                paywall_id: PAYWALL_ID,
                title: 'Default',
            },
            callIndex: 0,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('update with --audiences sends JSON verbatim', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PLACEMENT_RESPONSE]);

        const audiences = [{ content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 0, segment_ids: [] }];

        await runCommand([
            'placements',
            'update',
            TEST_RESOURCE_ID,
            '--app',
            TEST_APP_ID,
            '--title',
            'Default',
            '--developer-id',
            'default',
            '--audiences',
            JSON.stringify(audiences),
        ]);

        assertFetch({
            body: { audiences, developer_id: 'default', paywall_id: null, title: 'Default' },
            callIndex: 0,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    describe('A/B test audiences', () => {
        beforeEach(() => {
            process.env.ADAPTY_TOKEN = 'test-token';
        });

        it('get prints the A/B and crossplacement entries as the API sends them', async () => {
            fetchStub = mockFetch([{ ...PLACEMENT_RESPONSE, audiences: AB_AUDIENCES }]);

            const { stdout } = await runCommand(`placements get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --json`);

            expect(JSON.parse(stdout)).to.deep.equal({ ...PLACEMENT_RESPONSE, audiences: AB_AUDIENCES });
        });

        it('get shows the test title and the test id in the human output', async () => {
            fetchStub = mockFetch([{ ...PLACEMENT_RESPONSE, audiences: AB_AUDIENCES }]);

            const { stdout } = await runCommand(`placements get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);

            expect(stdout).to.contain('Live paywall test');
            expect(stdout).to.contain(TEST_ID);
        });

        it('update sends the entries of get back unchanged, A/B and crossplacement entries included', async () => {
            fetchStub = mockFetch([PLACEMENT_RESPONSE]);

            const { error } = await runCommand(writeArgs('update', AB_AUDIENCES));

            expect(error).to.equal(undefined);
            expect(fetchStub.callCount).to.equal(1);

            assertFetch({
                body: { audiences: AB_AUDIENCES },
                callIndex: 0,
                method: 'PUT',
                path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`,
                stub: fetchStub,
            });
        });

        it('create accepts a flow test entry and sends it unchanged', async () => {
            fetchStub = mockFetch([PLACEMENT_RESPONSE]);

            const audiences = [{ ab_test_id: TEST_ID, content_type: 'flow_ab_test', priority: 0, segment_ids: [] }];
            const { error } = await runCommand(writeArgs('create', audiences));

            expect(error).to.equal(undefined);

            assertFetch({
                body: { audiences },
                callIndex: 0,
                method: 'POST',
                path: `/apps/${TEST_APP_ID}/placements/`,
                stub: fetchStub,
            });
        });

        it('update refuses a test entry without ab_test_id before any request', async () => {
            fetchStub = mockFetch([PLACEMENT_RESPONSE]);

            const { error } = await runCommand(
                writeArgs('update', [{ content_type: 'ab_test', priority: 0, segment_ids: [SEGMENT_ID] }]),
            );

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('--audiences[0]: an entry with content_type "ab_test" requires ab_test_id');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('update refuses an entry kind that it does not know and tells to update the CLI', async () => {
            fetchStub = mockFetch([PLACEMENT_RESPONSE]);

            const { error } = await runCommand(
                writeArgs('update', [{ content_type: 'onboarding_ab_test', priority: 0, segment_ids: [] }]),
            );

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('--audiences[0]: this CLI does not know this audience kind; update the CLI');
            expect(error?.message).to.not.contain('must be "paywall" or "flow"');
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('list --type', () => {
        const queryOf = (index: number): URLSearchParams =>
            new URL(fetchStub.getCall(index).args[0] as string).searchParams;

        it('sends filter[placement_type] only when --type is given, and shows the type of each placement', async () => {
            process.env.ADAPTY_TOKEN = 'test-token';

            fetchStub = mockFetch([{
                data: [
                    { ...PLACEMENT_RESPONSE, title: 'Main', type: 'flow' },
                    { ...PLACEMENT_RESPONSE, developer_id: 'old', title: 'Old', type: null },
                ],
                meta: { pagination: { count: 2, page: 1, pages: 1 } },
            }]);

            const { stdout } = await runCommand(`placements list --app ${TEST_APP_ID} --type flow`);

            expect(queryOf(0).get('filter[placement_type]')).to.equal('flow');
            expect(stdout).to.contain('Type: flow');
            // the second placement has no type: the human view leaves it out, as it leaves out every empty value
            expect(stdout.match(/Type:/g)).to.have.length(1);

            const json = await runCommand(`placements list --app ${TEST_APP_ID} --json`);

            expect((JSON.parse(json.stdout) as { data: { type: null | string }[] }).data.map(item => item.type)).to.deep.equal(['flow', null]);
            expect(queryOf(1).has('filter[placement_type]')).to.equal(false);
        });

        it('sends a type it cannot judge, and the server answer is the error', async () => {
            process.env.ADAPTY_TOKEN = 'test-token';

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
            expect(queryOf(0).get('filter[placement_type]')).to.equal('foo');
        });
    });
});
