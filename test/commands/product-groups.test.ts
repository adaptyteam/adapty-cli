import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    mockFetch,
    mockFetchSteps,
    restoreFetch,
    TEST_APP_ID,
} from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const GROUPS = {
    data: [{ group_id: '21', group_name: 'Premium' }],
    meta: { pagination: { count: 1, page: 1, pages: 1 } },
};

describe('product-groups', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET with the store and prints id and name', async () => {
        fetchStub = mockFetch([GROUPS]);

        const { stdout } = await runCommand(`product-groups list --app ${TEST_APP_ID} --store app_store`);

        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/product-groups/`, query: { store: 'app_store' }, stub: fetchStub });
        expect(stdout).to.contain('Group ID: 21');
        expect(stdout).to.contain('Group Name: Premium');
    });

    it('list asks for page 1 of 20 by default', async () => {
        fetchStub = mockFetch([GROUPS]);

        await runCommand(`product-groups list --app ${TEST_APP_ID} --store app_store`);

        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/product-groups/`, query: { 'page[number]': '1', 'page[size]': '20' }, stub: fetchStub });
    });

    it('list passes --page and --page-size to the query', async () => {
        fetchStub = mockFetch([GROUPS]);

        await runCommand(`product-groups list --app ${TEST_APP_ID} --store play_store --page 3 --page-size 50`);

        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/product-groups/`, query: { 'page[number]': '3', 'page[size]': '50', 'store': 'play_store' }, stub: fetchStub });
    });

    it('list --json prints the page as the server sent it', async () => {
        fetchStub = mockFetch([GROUPS]);

        const { stdout } = await runCommand(`product-groups list --app ${TEST_APP_ID} --store app_store --json`);

        expect(JSON.parse(stdout)).to.deep.equal(GROUPS);
    });

    it('list refuses a store that is not app_store or play_store', async () => {
        fetchStub = mockFetch([GROUPS]);

        const { error } = await runCommand(`product-groups list --app ${TEST_APP_ID} --store stripe`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('create POSTs the name and points to the list for the id', async () => {
        fetchStub = mockFetch([{ group_name: 'Premium' }]);

        const { stdout } = await runCommand(`product-groups create --app ${TEST_APP_ID} --store app_store --name Premium`);

        assertFetch({ body: { group_name: 'Premium', store: 'app_store' }, callIndex: 0, method: 'POST', path: `/apps/${TEST_APP_ID}/product-groups/`, stub: fetchStub });
        expect(fetchStub.callCount).to.equal(1);
        expect(stdout).to.contain('Group created! Its id is in `product-groups list`.');
        expect(stdout).to.contain('Group Name: Premium');
    });

    it('create --json prints the server answer', async () => {
        fetchStub = mockFetch([{ group_name: 'Premium' }]);

        const { stdout } = await runCommand(`product-groups create --app ${TEST_APP_ID} --store app_store --name Premium --json`);

        expect(JSON.parse(stdout)).to.deep.equal({ group_name: 'Premium' });
    });

    it('create of a name that exists is sent, and the server refusal is exit 4 with its code', async () => {
        fetchStub = mockFetchSteps([
            { body: { error_code: 'subscription_group_already_exists', errors: [], status_code: 409 }, status: 409 },
        ]);

        const { error } = await runCommand(`product-groups create --app ${TEST_APP_ID} --store app_store --name Premium`);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error).to.have.property('code', 'subscription_group_already_exists');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('create refuses a name of more than 64 characters before any request', async () => {
        fetchStub = mockFetch([GROUPS]);

        const { error } = await runCommand(`product-groups create --app ${TEST_APP_ID} --store app_store --name ${'x'.repeat(65)}`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--name: must be at most 64 characters');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('create on Google Play is sent, and the server refusal is exit 4 with its code', async () => {
        fetchStub = mockFetchSteps([
            { body: { error_code: 'product_group_create_not_supported', errors: [], status_code: 400 }, status: 400 },
        ]);

        const { error } = await runCommand(`product-groups create --app ${TEST_APP_ID} --store play_store --name X`);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(fetchStub.callCount).to.equal(1);
        assertFetch({ callIndex: 0, method: 'POST', path: `/apps/${TEST_APP_ID}/product-groups/`, stub: fetchStub });
        expect(error).to.have.property('code', 'product_group_create_not_supported');
    });
});
