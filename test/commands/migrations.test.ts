import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    mockFetch,
    mockFetchFailure,
    restoreFetch,
    TEST_APP_ID,
} from '../helpers/mock-fetch.js';

import type { Envelope, WizardError } from '../../src/sdk/adapty/index.js';

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/migration-envelope.json', import.meta.url));
const ENVELOPE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Envelope;
const REPORT: Envelope = { ...ENVELOPE, result: { rows: [{ adapty: 'app_1', revenuecat: 'app_ios' }] } };
const INPUT_FILE = fileURLToPath(new URL('../fixtures/action-input.json', import.meta.url));

const CONFIRMED = 'act_confirm_paywalls';

const WIZARD_ERROR: WizardError = { error: {
    code: 'validation_error',
    detail: 'A mapping decision is missing.',
    fields: [{ path: 'input.decision', message: 'This field is required.' }],
    message: 'Invalid action input',
    next_step: 'Read status and prepare input using the current schema.',
    request_id: 'req_example',
    retry_after_seconds: null,
    retryable: false,
} };

const UPLOADS: Envelope = {
    ...ENVELOPE,
    next_actions: [{
        action_id: 'upload_file',
        confirm: null,
        detail: null,
        kind: 'upload',
        reads: [],
        step_id: 'step_import',
        title: 'Upload the RevenueCat export',
    }],
};

/** A kind this version does not know, handed over as a link the way external actions are. */
const LINKED: Envelope = {
    ...ENVELOPE,
    next_actions: [{
        action_id: 'act_sign_agreement',
        confirm: null,
        detail: null,
        href: 'https://app.adapty.io/migrations/mig_01H9Z/agreement',
        kind: 'sign',
        reads: [],
        step_id: 'step_import',
        title: 'Sign the agreement',
    }],
};

const FUTURE_ACTION: Envelope = {
    ...ENVELOPE,
    next_actions: [{
        action_id: 'act_future',
        confirm: 'Review the consequences before proceeding.',
        detail: 'Follow the instructions from the newer server.',
        kind: 'future_kind',
        reads: [],
        step_id: 'step_import',
        title: 'A new migration action',
    }],
};

describe('migrations', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_MIGRATION;
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET /migrations', async () => {
        fetchStub = mockFetch([{ available: [], items: [] }]);
        await runCommand('migrations list');
        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations', stub: fetchStub });
    });

    it('preserves server diagnostics in JSON through the HTTP and CLI adapters', async () => {
        fetchStub = mockFetchFailure(WIZARD_ERROR, { status: 422 });

        const { stdout } = await runCommand('migrations status -m mig_01H9Z --json');

        expect(JSON.parse(stdout)).to.deep.equal({ error: {
            ...WIZARD_ERROR.error,
            error_code: 'validation_error',
            status: 422,
            status_code: 422,
        } });

        expect(fetchStub.callCount).to.equal(1);
    });

    it('shows server details, field errors and the next step to a human with exit 4', async () => {
        fetchStub = mockFetchFailure(WIZARD_ERROR, { status: 422 });

        const { error, stdout } = await runCommand('migrations status -m mig_01H9Z');

        expect(stdout).to.equal('');
        expect(error?.oclif?.exit).to.equal(exitCode.api);

        expect(error?.message).to.equal([
            'Invalid action input',
            'A mapping decision is missing.',
            '',
            '  input.decision: This field is required.',
            '',
            'Next step: Read status and prepare input using the current schema.',
            'Request ID: req_example',
        ].join('\n'));

        expect(fetchStub.callCount).to.equal(1);
    });

    it('status reads the migration it was pointed at', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand('migrations status -m mig_01H9Z');

        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });
        expect(fetchStub.callCount).to.equal(1);
        expect(stdout).to.contain('mig_01H9Z  main  action_required');
        expect(stdout).to.contain('Do next:');
    });

    it('status takes the migration from $ADAPTY_MIGRATION', async () => {
        process.env.ADAPTY_MIGRATION = 'mig_env';
        fetchStub = mockFetch([ENVELOPE]);

        await runCommand('migrations status');

        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_env', stub: fetchStub });
    });

    it('status asks for the migration instead of picking one, before any request', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand('migrations status');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('migration');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('status --wait stops at once when the migration already wants the user', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand('migrations status -m mig_01H9Z --wait');

        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });
        expect(fetchStub.callCount).to.equal(1);
        expect(stdout).to.contain('mig_01H9Z  main  action_required');
    });

    it('status refuses a timeout without --wait, rather than quietly not waiting', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand('migrations status -m mig_01H9Z --timeout 300s');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--wait');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('status refuses a timeout it cannot honour, before any request', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand('migrations status -m mig_01H9Z --wait --timeout 900s');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('600s');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('status prints the envelope untouched under --json', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand('migrations status -m mig_01H9Z --json');

        expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
    });

    it('show lists what can be read now, without naming a resource', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand('migrations show -m mig_01H9Z');

        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });
        expect(stdout).to.contain('report');
        expect(stdout).to.contain('Migration report');
    });

    it('show reads the named resource and prints what came back', async () => {
        fetchStub = mockFetch([REPORT]);

        const { stdout } = await runCommand('migrations show report -m mig_01H9Z');

        assertFetch({
            callIndex: 0,
            method: 'GET',
            path: '/migrations/mig_01H9Z/resources/report',
            stub: fetchStub,
        });

        expect(JSON.parse(stdout)).to.deep.equal(REPORT.result);
    });

    it('show prints the envelope untouched under --json, not only its result', async () => {
        fetchStub = mockFetch([REPORT]);

        const { stdout } = await runCommand('migrations show report -m mig_01H9Z --json');

        expect(JSON.parse(stdout)).to.deep.equal(REPORT);
    });

    it('steps prints the checklist of the migration it was pointed at', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand('migrations steps -m mig_01H9Z');

        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });
        expect(fetchStub.callCount).to.equal(1);
        expect(stdout).to.contain('[x] step_apps      Apps  2 apps migrated');
        expect(stdout).to.contain('[>] step_paywalls  Paywalls');
        expect(stdout).to.not.contain('Do next:');
    });

    it('steps prints the envelope untouched under --json', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand('migrations steps -m mig_01H9Z --json');

        expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
    });

    it('run reads the migration, then posts the input against the revision it read', async () => {
        fetchStub = mockFetch([ENVELOPE, ENVELOPE]);

        await runCommand(['migrations', 'run', CONFIRMED, '-m', 'mig_01H9Z', '--input', '{"decisions":[]}', '--yes']);

        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });

        assertFetch({
            body: { expected_revision: 3, input: { decisions: [] } },
            callIndex: 1,
            method: 'POST',
            path: `/migrations/mig_01H9Z/actions/${CONFIRMED}`,
            stub: fetchStub,
        });

        expect(fetchStub.callCount).to.equal(2);
    });

    it('run takes the input from a file', async () => {
        fetchStub = mockFetch([ENVELOPE, ENVELOPE]);

        await runCommand(['migrations', 'run', CONFIRMED, '-m', 'mig_01H9Z', '--input-file', INPUT_FILE, '--yes']);

        assertFetch({
            // assertFetch compares serialized JSON, so key order must match the fixture.
            body: { input: { decisions: [{ rc_id: 'prod_monthly', target: 'create', access_level: 'premium' }] } },
            callIndex: 1,
            method: 'POST',
            path: `/migrations/mig_01H9Z/actions/${CONFIRMED}`,
            stub: fetchStub,
        });
    });

    it('run reads and validates stdin for input actions after looking up the action', async () => {
        fetchStub = mockFetch([ENVELOPE, ENVELOPE]);

        const stdin = sinon.stub(process.stdin, Symbol.asyncIterator).callsFake(() => {
            expect(fetchStub.callCount).to.equal(1);

            return Readable.from([Buffer.from('{"decision":"create"}')])[Symbol.asyncIterator]();
        });

        try {
            const { error } = await runCommand([
                'migrations', 'run', CONFIRMED, '-m', 'mig_01H9Z', '--input-file', '-', '--yes',
            ]);

            expect(error).to.equal(undefined);
            expect(stdin.calledOnce).to.equal(true);

            assertFetch({
                body: { input: { decision: 'create' } },
                callIndex: 1,
                method: 'POST',
                path: `/migrations/mig_01H9Z/actions/${CONFIRMED}`,
                stub: fetchStub,
            });
        } finally {
            stdin.restore();
        }
    });

    it('run prints the confirmation and changes nothing without --yes', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand(['migrations', 'run', CONFIRMED, '-m', 'mig_01H9Z']);

        expect(error?.oclif?.exit).to.equal(exitCode.confirmRequired);
        expect(error?.message).to.contain('This cannot be undone');
        expect(error?.message).to.contain('--yes');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('run refuses an action the migration does not offer, and says what it does', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand(['migrations', 'run', 'no_such_action', '-m', 'mig_01H9Z']);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain(CONFIRMED);
        expect(fetchStub.callCount).to.equal(1);
    });

    it('run hands an external action over as a link, asking the server for nothing', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand(['migrations', 'run', 'act_open_report', '-m', 'mig_01H9Z', '--no-browser']);

        expect(stdout).to.contain('https://app.adapty.io/migrations/mig_01H9Z/report');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('run says a kind it cannot execute needs another way, instead of failing oddly', async () => {
        fetchStub = mockFetch([UPLOADS]);

        const { error } = await runCommand(['migrations', 'run', 'upload_file', '-m', 'mig_01H9Z']);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('adapty-cli');
        expect(error?.message).to.contain('Use the dashboard or an offered Cloud Export action.');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('run hands over a link from a kind it does not know, instead of calling it unsupported', async () => {
        fetchStub = mockFetch([LINKED]);

        const { error, stdout } = await runCommand([
            'migrations', 'run', 'act_sign_agreement', '-m', 'mig_01H9Z', '--no-browser',
        ]);

        expect(error).to.equal(undefined);
        expect(stdout).to.contain('https://app.adapty.io/migrations/mig_01H9Z/agreement');
        expect(fetchStub.callCount).to.equal(1);
    });

    for (const json of [false, true]) {
        for (const yes of [false, true]) {
            it(`run preserves an unknown action without executing it (json=${json}, yes=${yes})`, async () => {
                fetchStub = mockFetch([FUTURE_ACTION]);

                const { error, stdout } = await runCommand([
                    'migrations', 'run', 'act_future', '-m', 'mig_01H9Z',
                    ...(json ? ['--json'] : []), ...(yes ? ['--yes'] : []),
                ]);

                expect(error).to.equal(undefined);

                if (json) {
                    expect(JSON.parse(stdout)).to.deep.equal(FUTURE_ACTION);
                } else {
                    expect(stdout).to.contain('A new migration action');
                    expect(stdout).to.contain('Follow the instructions from the newer server.');
                    expect(stdout).to.contain('This action needs a newer adapty-cli');
                }

                expect(fetchStub.callCount).to.equal(1);
                assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });
            });
        }

        it(`status --wait returns an unknown state without polling (json=${json})`, async () => {
            const envelope = { ...ENVELOPE, migration: { ...ENVELOPE.migration, state: 'paused_for_review' } };

            fetchStub = mockFetch([envelope]);

            const { error, stdout } = await runCommand([
                'migrations', 'status', '-m', 'mig_01H9Z', '--wait', ...(json ? ['--json'] : []),
            ]);

            expect(error).to.equal(undefined);

            if (json) {
                expect(JSON.parse(stdout)).to.deep.equal(envelope);
            } else {
                expect(stdout).to.contain('paused_for_review');
                expect(stdout).to.contain('This migration state needs a newer adapty-cli');
            }

            expect(fetchStub.callCount).to.equal(1);
        });
    }

    it('run does not wait for stdin when it cannot execute an unknown action', async () => {
        fetchStub = mockFetch([FUTURE_ACTION]);

        const stdin = sinon.stub(process.stdin, Symbol.asyncIterator).throws(new Error('Must not read stdin'));

        try {
            const { error, stdout } = await runCommand([
                'migrations', 'run', 'act_future', '-m', 'mig_01H9Z', '--input-file', '-',
            ]);

            expect(error).to.equal(undefined);
            expect(stdout).to.contain('This action needs a newer adapty-cli');
            expect(stdin.called).to.equal(false);
            expect(fetchStub.callCount).to.equal(1);
        } finally {
            stdin.restore();
        }
    });

    for (const inputFlags of [['--input', '{}'], ['--input-file', INPUT_FILE], ['--input-file', '-']]) {
        it(`run rejects external action input via ${inputFlags.join(' ')} in human and JSON modes`, async () => {
            fetchStub = mockFetch([ENVELOPE]);

            for (const json of [false, true]) {
                const result = await runCommand([
                    'migrations', 'run', 'act_open_report', '-m', 'mig_01H9Z',
                    ...inputFlags, '--no-browser', ...(json ? ['--json'] : []),
                ]);

                if (json) {
                    const output = JSON.parse(result.stdout) as { error: { code: string; message: string } };

                    expect(output.error.code).to.equal('action_input_unsupported');
                    expect(output.error.message).to.contain('does not accept --input or --input-file');
                } else {
                    expect(result.stdout).to.equal('');
                    expect(result.error?.oclif?.exit).to.equal(exitCode.usage);
                    expect(result.error?.message).to.contain('does not accept --input or --input-file');
                }
            }

            expect(fetchStub.callCount).to.equal(2);
            assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });
            assertFetch({ callIndex: 1, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });
        });
    }

    it('run rejects an input that is not a JSON object, before any request', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand(['migrations', 'run', CONFIRMED, '-m', 'mig_01H9Z', '--input', '[]', '--yes']);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--input');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('run prints the envelope the action answered with under --json', async () => {
        fetchStub = mockFetch([ENVELOPE, REPORT]);

        const { stdout } = await runCommand(['migrations', 'run', CONFIRMED, '-m', 'mig_01H9Z', '--yes', '--json']);

        expect(JSON.parse(stdout)).to.deep.equal(REPORT);
    });

    it('close reads the migration, then posts the outcome against that revision', async () => {
        fetchStub = mockFetch([ENVELOPE, ENVELOPE]);

        await runCommand('migrations close --outcome finish --yes -m mig_01H9Z');

        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations/mig_01H9Z', stub: fetchStub });

        assertFetch({
            body: { expected_revision: 3, outcome: 'finish' },
            callIndex: 1,
            method: 'POST',
            path: '/migrations/mig_01H9Z/close',
            stub: fetchStub,
        });

        expect(fetchStub.callCount).to.equal(2);
    });

    it('close cancels a migration the same way', async () => {
        fetchStub = mockFetch([ENVELOPE, ENVELOPE]);

        await runCommand('migrations close --outcome cancel --yes -m mig_01H9Z');

        assertFetch({
            body: { outcome: 'cancel' },
            callIndex: 1,
            method: 'POST',
            path: '/migrations/mig_01H9Z/close',
            stub: fetchStub,
        });
    });

    it('close without --yes does nothing at all, not even a read', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand('migrations close --outcome finish -m mig_01H9Z');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('close refuses an outcome that is neither finish nor cancel', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand('migrations close --outcome archive --yes -m mig_01H9Z');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('outcome');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('create names the new app and lets the server pick the flow', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand('migrations create --name "Acme Fitness"');

        assertFetch({
            body: { app_name: 'Acme Fitness', flow: 'main' },
            callIndex: 0,
            method: 'POST',
            path: '/migrations',
            stub: fetchStub,
        });

        expect(stdout).to.contain('Migration created.');
        expect(stdout).to.contain('mig_01H9Z  main  action_required');
        expect(stdout).to.contain('Continue with `adapty migrations status`.');
    });

    it('create starts an optional flow for an app that exists', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        await runCommand(`migrations create --flow transactions --app ${TEST_APP_ID}`);

        assertFetch({
            body: { app_id: TEST_APP_ID, flow: 'transactions' },
            callIndex: 0,
            method: 'POST',
            path: '/migrations',
            stub: fetchStub,
        });
    });

    it('create prints the envelope untouched under --json', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { stdout } = await runCommand('migrations create --name "Acme Fitness" --json');

        expect(JSON.parse(stdout)).to.deep.equal(ENVELOPE);
    });

    it('create with nothing to go on names the flags, before any request', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand('migrations create');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--name');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('create refuses a flow without the app it runs for', async () => {
        fetchStub = mockFetch([ENVELOPE]);

        const { error } = await runCommand('migrations create --flow transactions');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });
});
