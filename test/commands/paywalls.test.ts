import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    EMPTY_LIST_RESPONSE,
    mockFetch,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const PAYWALL_RESPONSE = { id: TEST_RESOURCE_ID, title: 'Default Paywall' };
const APP_ID_HINT = 'Invalid app ID format. Run `adapty apps list` to find your app ID.';

describe('paywalls', () => {
    let fetchStub: sinon.SinonStub;

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET /apps/{app}/paywalls', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);
        await runCommand(`paywalls list --app ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/paywalls/`, stub: fetchStub });
    });

    it('get calls GET /apps/{app}/paywalls/{id}', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ ...PAYWALL_RESPONSE, product_ids: [] }]);
        await runCommand(`paywalls get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/`, stub: fetchStub });
    });

    it('create calls POST /apps/{app}/paywalls', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PAYWALL_RESPONSE]);
        await runCommand(`paywalls create --app ${TEST_APP_ID} --title "Default Paywall" --product-id ${TEST_RESOURCE_ID}`);

        assertFetch({
            body: { product_ids: [TEST_RESOURCE_ID], title: 'Default Paywall' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/paywalls/`,
            stub: fetchStub,
        });
    });

    it('update calls PUT /apps/{app}/paywalls/{id}', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PAYWALL_RESPONSE]);
        await runCommand(`paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title "Default Paywall" --product-id ${TEST_RESOURCE_ID}`);

        assertFetch({
            body: { product_ids: [TEST_RESOURCE_ID], title: 'Default Paywall' },
            callIndex: 0,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('placements calls GET /apps/{app}/paywalls/{id}/placements', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ data: [] }]);
        await runCommand(`paywalls placements ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);

        assertFetch({
            callIndex: 0,
            method: 'GET',
            path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/placements/`,
            stub: fetchStub,
        });
    });

    it('rejects an --app that is not a uuid with exit 2 before any request, under --json too', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);

        const human = await runCommand('paywalls list --app not-a-uuid');

        // oclif keeps an exit code an earlier command left behind, so start from none
        process.exitCode = undefined;

        const json = await runCommand('paywalls list --app not-a-uuid --json');
        const exit = process.exitCode;

        process.exitCode = 0;

        expect(human.error?.oclif?.exit).to.equal(exitCode.usage);
        expect(human.error?.message).to.contain(APP_ID_HINT);
        expect(exit).to.equal(exitCode.usage);

        // A legacy command extends oclif's Command, which serializes the error object itself:
        // CliError.toJSON makes that the same clean shape a migrated command prints
        expect(JSON.parse(json.stdout)).to.deep.equal({ error: { message: APP_ID_HINT } });

        expect(fetchStub.callCount).to.equal(0);
    });
});
