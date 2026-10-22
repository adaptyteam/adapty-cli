import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    EMPTY_LIST_RESPONSE,
    mockFetch,
    mockFetchFailure,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

import type * as sinon from 'sinon';

const PRODUCT_ID = '770e8400-e29b-41d4-a716-446655440002';
const OFFER_ID = TEST_RESOURCE_ID;
const OFFER_PATH = `/apps/${TEST_APP_ID}/offers/${OFFER_ID}/`;

const OFFER = {
    duration: null,
    id: OFFER_ID,
    offer_type: 'promotional',
    product_id: PRODUCT_ID,
    store_offers: { app_store: { offer_id: 'spring_ios' }, play_store: { offer_id: 'spring-android' } },
    title: 'Spring',
};

const BASE_FLAGS = `--app ${TEST_APP_ID} --offer ${OFFER_ID}`;

describe('product-offers', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET under the product and prints the store ids', async () => {
        fetchStub = mockFetch([{ ...EMPTY_LIST_RESPONSE, data: [OFFER] }]);

        const { stdout } = await runCommand(`product-offers list --app ${TEST_APP_ID} --product ${PRODUCT_ID}`);

        assertFetch({
            callIndex: 0,
            method: 'GET',
            path: `/apps/${TEST_APP_ID}/products/${PRODUCT_ID}/offers/`,
            query: { 'page[number]': '1', 'page[size]': '20' },
            stub: fetchStub,
        });

        expect(stdout).to.contain('spring_ios');
        expect(stdout).to.contain('spring-android');
    });

    it('get --json prints the offer as the server sent it', async () => {
        fetchStub = mockFetch([OFFER]);

        const { stdout } = await runCommand(`product-offers get ${BASE_FLAGS} --json`);

        expect(JSON.parse(stdout)).to.deep.equal(OFFER);
    });

    it('get calls GET /apps/{app}/offers/{id}', async () => {
        fetchStub = mockFetch([OFFER]);
        const { stdout } = await runCommand(`product-offers get ${BASE_FLAGS}`);

        assertFetch({ callIndex: 0, method: 'GET', path: OFFER_PATH, stub: fetchStub });
        expect(stdout).to.contain('Title: Spring');
        expect(stdout).to.contain('spring_ios');
    });

    it('create calls POST with the server type value `win_back`', async () => {
        fetchStub = mockFetch([OFFER]);

        await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title Back --type win_back --ios-offer-id spring_ios`);

        assertFetch({
            body: { ios_offer_id: 'spring_ios', offer_type: 'win_back', title: 'Back' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/products/${PRODUCT_ID}/offers/`,
            stub: fetchStub,
        });
    });

    it('create without a store id exits 2 and sends nothing', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title Spring --type win_back`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('create refuses a win-back on Google Play with exit 2 and sends nothing', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title B --type win_back --android-offer-id x`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('list of a product the app does not have reports the server code under --json', async () => {
        fetchStub = mockFetchFailure({ error_code: 'adapty_product_does_not_exist', errors: [], status_code: 404 }, { status: 404 });

        const { stdout } = await runCommand(`product-offers list --app ${TEST_APP_ID} --product ${PRODUCT_ID} --json`);

        expect((JSON.parse(stdout) as { error: { code: string; status: number } }).error).to.include({ code: 'adapty_product_does_not_exist', status: 404 });
    });

    it('update refuses an introductory offer after the read and sends no PUT', async () => {
        fetchStub = mockFetch([{ ...OFFER, offer_type: 'introductory' }]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --type promotional`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('introductory offers are read-only');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('update reads the offer, then PUTs it with the title changed and both ids kept', async () => {
        fetchStub = mockFetch([OFFER, { ...OFFER, title: 'Spring 2' }]);

        await runCommand(`product-offers update ${BASE_FLAGS} --title "Spring 2"`);

        assertFetch({ callIndex: 0, method: 'GET', path: OFFER_PATH, stub: fetchStub });

        assertFetch({
            body: { android_offer_id: 'spring-android', ios_offer_id: 'spring_ios', offer_type: 'promotional', title: 'Spring 2' },
            callIndex: 1,
            method: 'PUT',
            path: OFFER_PATH,
            stub: fetchStub,
        });
    });

    it('update to win_back with the Google Play side cleared PUTs only the App Store id', async () => {
        fetchStub = mockFetch([OFFER, { ...OFFER, offer_type: 'win_back' }]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --type win_back --clear-android-offer-id`);

        expect(error).to.equal(undefined);

        assertFetch({
            body: { ios_offer_id: 'spring_ios', offer_type: 'win_back', title: 'Spring' },
            callIndex: 1,
            method: 'PUT',
            path: OFFER_PATH,
            stub: fetchStub,
        });
    });

    it('update that would clear the last store side exits 2 after the GET and sends no PUT', async () => {
        fetchStub = mockFetch([{ ...OFFER, store_offers: { app_store: { offer_id: 'spring_ios' } } }]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --clear-ios-offer-id`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(1);
        assertFetch({ callIndex: 0, method: 'GET', path: OFFER_PATH, stub: fetchStub });
    });

    it('update refuses a store id together with its clear flag', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --ios-offer-id a --clear-ios-offer-id`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('rejects an offer id that is not a UUID before any request', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers get --app ${TEST_APP_ID} --offer nope`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });
});
