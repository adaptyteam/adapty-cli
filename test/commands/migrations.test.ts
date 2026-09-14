import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    mockFetch,
    restoreFetch,
    TEST_APP_ID,
} from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/migration-envelope.json', import.meta.url));
const ENVELOPE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown;

describe('migrations', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET /migrations', async () => {
        fetchStub = mockFetch([{ available: [], items: [] }]);
        await runCommand('migrations list');
        assertFetch({ callIndex: 0, method: 'GET', path: '/migrations', stub: fetchStub });
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
        expect(stdout).to.contain('adapty migrations status -m mig_01H9Z');
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
