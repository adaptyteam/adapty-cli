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

const PRODUCT_RESPONSE = { id: TEST_RESOURCE_ID, title: 'Monthly', vendor_products: {} };

describe('products', () => {
    let fetchStub: sinon.SinonStub;

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET /apps/{app}/products', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);
        await runCommand(`products list --app ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/products/`, stub: fetchStub });
    });

    it('get calls GET /apps/{app}/products/{id}', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ ...PRODUCT_RESPONSE, access_level_id: 'al', period: 'monthly' }]);
        await runCommand(`products get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/`, stub: fetchStub });
    });

    const CREATE = `products create --app ${TEST_APP_ID} --title Monthly --access-level-id ${TEST_RESOURCE_ID}`;

    it('create with no store binding sends the title, period, access level and USD price only', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PRODUCT_RESPONSE]);
        await runCommand(`${CREATE} --period monthly --price-usd 9.99`);

        assertFetch({ callIndex: 0, method: 'POST', path: `/apps/${TEST_APP_ID}/products/`, stub: fetchStub });

        const sent: unknown = JSON.parse((fetchStub.firstCall.args[1] as { body: string }).body);

        expect(sent).to.deep.equal({ access_level_id: TEST_RESOURCE_ID, period: 'monthly', price_usd: 9.99, title: 'Monthly' });
    });

    it('create sends the iOS product id', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PRODUCT_RESPONSE]);
        await runCommand(`${CREATE} --period monthly --ios-product-id com.example.monthly`);

        assertFetch({
            body: { access_level_id: TEST_RESOURCE_ID, ios_product_id: 'com.example.monthly', period: 'monthly', title: 'Monthly' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/products/`,
            stub: fetchStub,
        });
    });

    it('create maps Stripe and Paddle bindings to the POST body', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PRODUCT_RESPONSE]);
        await runCommand(`${CREATE} --period monthly --stripe-product-id prod_x --stripe-price-id price_x --paddle-product-id pro_x --paddle-price-id pri_x`);

        assertFetch({
            body: { paddle_price_id: 'pri_x', paddle_product_id: 'pro_x', stripe_price_id: 'price_x', stripe_product_id: 'prod_x' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/products/`,
            stub: fetchStub,
        });
    });

    const badCreates = [
        { flags: '--period monthly --stripe-product-id prod_x', name: 'a Stripe product without its price' },
        { flags: '--period monthly --stripe-price-id price_x', name: 'a Stripe price without its product' },
        { flags: '--period monthly --paddle-product-id pro_x', name: 'a Paddle product without its price' },
        { flags: '--period monthly --paddle-price-id pri_x', name: 'a Paddle price without its product' },
        { flags: '--period monthly --android-product-id premium', name: 'an Android subscription without a base plan' },
        { flags: '--period monthly --price-usd abc', name: 'a price that is not a number' },
        { flags: '--period yearly', name: 'an unknown period' },
    ];

    for (const { flags, name } of badCreates) {
        it(`create with ${name} exits 2 and sends nothing`, async () => {
            process.env.ADAPTY_TOKEN = 'test-token';
            fetchStub = mockFetch([PRODUCT_RESPONSE]);
            const { error } = await runCommand(`${CREATE} ${flags}`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(fetchStub.callCount).to.equal(0);
        });
    }

    it('create --json prints the product', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PRODUCT_RESPONSE]);
        const { stdout } = await runCommand(`${CREATE} --period lifetime --android-product-id premium --json`);

        expect(JSON.parse(stdout)).to.deep.equal(PRODUCT_RESPONSE);
    });

    it('update reads the product, then PUTs it whole with the title changed', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ ...PRODUCT_RESPONSE, access_level_id: 'al' }, PRODUCT_RESPONSE]);
        await runCommand(`products update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title Yearly`);

        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/`, stub: fetchStub });

        assertFetch({
            body: { access_level_id: 'al', title: 'Yearly' },
            callIndex: 1,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('update --price-usd sends the price with the stored title and access level', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ ...PRODUCT_RESPONSE, access_level_id: 'al' }, PRODUCT_RESPONSE]);
        await runCommand(`products update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --price-usd 9.99`);

        assertFetch({
            body: { access_level_id: 'al', price_usd: 9.99, title: 'Monthly' },
            callIndex: 1,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('update --price-usd prints the product when the server applied the price', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ ...PRODUCT_RESPONSE, access_level_id: 'al', price_usd: null }, { ...PRODUCT_RESPONSE, price_usd: 9.99 }]);
        const { error, stdout } = await runCommand(`products update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --price-usd 9.99`);

        expect(error).to.equal(undefined);
        expect(stdout).to.contain('Product updated!');
    });

    it('update --price-usd exits 4 when the product keeps its earlier price', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ ...PRODUCT_RESPONSE, access_level_id: 'al', price_usd: 4.99 }, { ...PRODUCT_RESPONSE, price_usd: 4.99 }]);
        const { error, stdout } = await runCommand(`products update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title Yearly --price-usd 9.99`);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error).to.have.property('code', 'price_usd_not_applied');
        expect(error?.message).to.contain('already has a USD price of 4.99');
        expect(error?.message).to.contain('The title was saved.');
        expect(stdout).not.to.contain('Product updated!');
    });

    it('update --price-usd --json prints the error with its code when the price was not applied', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        process.exitCode = undefined;
        fetchStub = mockFetch([{ ...PRODUCT_RESPONSE, access_level_id: 'al', price_usd: 4.99 }, { ...PRODUCT_RESPONSE, price_usd: 4.99 }]);
        const { stdout } = await runCommand(`products update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --price-usd 9.99 --json`);
        const exit = process.exitCode;
        process.exitCode = undefined;

        expect(exit).to.equal(exitCode.api);

        expect(JSON.parse(stdout)).to.deep.include({
            error: {
                code: 'price_usd_not_applied',
                message: 'The product already has a USD price of 4.99: --price-usd was not applied. Nothing else was asked for.',
                saved: false,
            },
        });
    });

    it('get rejects a product id that is not a uuid, before any request', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{}]);
        const { error } = await runCommand(`products get not-a-uuid --app ${TEST_APP_ID}`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('Invalid product ID format');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('update with nothing to change exits 2 and sends nothing', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PRODUCT_RESPONSE]);
        const { error } = await runCommand(`products update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('get prints the USD price and the status of each store product', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';

        fetchStub = mockFetch([{
            ...PRODUCT_RESPONSE,
            price_usd: 9.99,
            vendor_products: { app_store: { base_plan_id: null, id: 'v1', product_id: 'p1', store_status: 'in_review' } },
        }]);

        const { stdout } = await runCommand(`products get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);

        expect(stdout).to.contain('Price Usd: 9.99');
        expect(stdout).to.contain('Store Status: in_review');
    });
});
