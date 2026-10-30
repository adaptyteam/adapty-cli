import { expect } from 'chai';

import { createAdapty } from '../../../../src/sdk/adapty/index.js';
import { validateCreateProduct } from '../../../../src/sdk/adapty/products/index.js';
import { ValidationError } from '../../../../src/sdk/core/errors.js';
import { createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

import type { Product } from '../../../../src/sdk/adapty/index.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, products: adapty.products };
};

const stored = (overrides: Partial<Product> = {}): Product => ({
    access_level_id: 'al1',
    id: 'p1',
    offers_count: 0,
    period: 'monthly',
    price_usd: 0,
    title: 'Monthly',
    vendor_products: {},
    ...overrides,
});

const body = (call: { body: string | undefined } | undefined): unknown => JSON.parse(call?.body ?? '');

describe('adapty.products', () => {
    it('reads the stored product and PUTs it back with only the price added', async () => {
        const { calls, products } = setup([{ body: stored() }, { body: stored({ price_usd: 9.99 }) }]);

        const result = await products.update('a1', 'p1', { priceUsd: 9.99 });

        expect(calls.map(call => `${call.method} ${call.url}`)).to.deep.equal([`GET ${BASE}/apps/a1/products/p1/`, `PUT ${BASE}/apps/a1/products/p1/`]);
        expect(body(calls[1])).to.deep.equal({ access_level_id: 'al1', price_usd: 9.99, title: 'Monthly' });
        expect(result.price_usd).to.equal(9.99);
    });

    it('sends the given title and access level and no price when none is given', async () => {
        const { calls, products } = setup([{ body: stored() }, { body: stored() }]);

        await products.update('a1', 'p1', { accessLevelId: 'al2', title: 'Yearly' });

        expect(body(calls[1])).to.deep.equal({ access_level_id: 'al2', title: 'Yearly' });
    });

    const badUpdates = [
        { input: {}, name: 'nothing to update' },
        { input: { title: ' ' }, name: 'a blank title' },
        { input: { priceUsd: -1 }, name: 'a negative price' },
        { input: { priceUsd: Number.NaN }, name: 'a price that is not a number' },
    ];

    for (const { input, name } of badUpdates) {
        it(`refuses an update with ${name} before any request`, async () => {
            const { calls, products } = setup([]);

            expect(await rejection(products.update('a1', 'p1', input))).to.be.instanceOf(ValidationError);
            expect(calls).to.have.lengthOf(0);
        });
    }

    it('creates with a snake_case body that leaves out what is not given', async () => {
        const { calls, products } = setup([{ body: stored() }]);

        await products.create('a1', { accessLevelId: 'al1', period: 'monthly', priceUsd: 9.99, title: 'Monthly' });

        expect(`${calls[0]?.method} ${calls[0]?.url}`).to.equal(`POST ${BASE}/apps/a1/products/`);
        expect(body(calls[0])).to.deep.equal({ access_level_id: 'al1', period: 'monthly', price_usd: 9.99, title: 'Monthly' });
    });

    it('creates with every store binding', async () => {
        const { calls, products } = setup([{ body: stored() }]);

        await products.create('a1', {
            accessLevelId: 'al1',
            androidBasePlanId: 'monthly',
            androidProductId: 'premium',
            iosProductId: 'com.example.monthly',
            paddlePriceId: 'pri_x',
            paddleProductId: 'pro_x',
            period: 'monthly',
            stripePriceId: 'price_x',
            stripeProductId: 'prod_x',
            title: 'Monthly',
        });

        expect(body(calls[0])).to.deep.equal({
            access_level_id: 'al1',
            android_base_plan_id: 'monthly',
            android_product_id: 'premium',
            ios_product_id: 'com.example.monthly',
            paddle_price_id: 'pri_x',
            paddle_product_id: 'pro_x',
            period: 'monthly',
            stripe_price_id: 'price_x',
            stripe_product_id: 'prod_x',
            title: 'Monthly',
        });
    });

    it('takes an Android lifetime product without a base plan', () => {
        expect(validateCreateProduct({ accessLevelId: 'al1', androidProductId: 'premium', period: 'lifetime', title: 'Forever' })).to.deep.equal([]);
    });

    const base = { accessLevelId: 'al1', period: 'monthly', title: 'Monthly' } as const;

    const badCreates = [
        { input: { ...base, title: ' ' }, name: 'a blank title', path: 'title' },
        { input: { ...base, priceUsd: -1 }, name: 'a negative price', path: 'priceUsd' },
        { input: { ...base, priceUsd: Number.POSITIVE_INFINITY }, name: 'an infinite price', path: 'priceUsd' },
        { input: { ...base, stripeProductId: 'prod_x' }, name: 'a Stripe product without its price', path: 'stripePriceId' },
        { input: { ...base, stripePriceId: 'price_x' }, name: 'a Stripe price without its product', path: 'stripeProductId' },
        { input: { ...base, paddleProductId: 'pro_x' }, name: 'a Paddle product without its price', path: 'paddlePriceId' },
        { input: { ...base, paddlePriceId: 'pri_x' }, name: 'a Paddle price without its product', path: 'paddleProductId' },
        { input: { ...base, androidBasePlanId: 'monthly', period: 'lifetime' }, name: 'a base plan without an Android product', path: 'androidBasePlanId' },
        { input: { ...base, androidProductId: 'premium' }, name: 'an Android subscription without a base plan', path: 'androidBasePlanId' },
        { input: { ...base, iosProductId: ' ' }, name: 'a blank iOS product id', path: 'iosProductId' },
        { input: { ...base, stripePriceId: 'price_x', stripeProductId: '' }, name: 'a blank Stripe product id', path: 'stripeProductId' },
    ] as const;

    for (const { input, name, path } of badCreates) {
        it(`refuses a create with ${name} before any request`, async () => {
            const { calls, products } = setup([]);

            expect(validateCreateProduct(input).map(issue => issue.path)).to.deep.equal([path]);
            expect(await rejection(products.create('a1', input))).to.be.instanceOf(ValidationError);
            expect(calls).to.have.lengthOf(0);
        });
    }

    it('pushes with a snake_case body that leaves out what is not given', async () => {
        const { calls, products } = setup([{ body: stored() }]);

        await products.push('a1', 'p1', { androidBasePlanId: 'monthly', store: 'play_store', storeProductId: 'premium' });

        expect(`${calls[0]?.method} ${calls[0]?.url}`).to.equal(`POST ${BASE}/apps/a1/products/p1/push/play_store/`);
        expect(body(calls[0])).to.deep.equal({ base_plan_id: 'monthly', store_product_id: 'premium' });
    });

    it('pushes to the App Store with the group and the screenshot', async () => {
        const { calls, products } = setup([{ body: stored() }]);

        await products.push('a1', 'p1', {
            groupId: '12',
            screenshot: 'data:image/png;base64,AAAA',
            store: 'app_store',
            storeProductId: 'premium',
        });

        expect(body(calls[0])).to.deep.equal({
            group_id: '12',
            screenshot: 'data:image/png;base64,AAAA',
            store_product_id: 'premium',
        });
    });

    const badPushes = [
        { input: { screenshot: 'data:image/png;base64,AA', store: 'app_store', storeProductId: ' ' }, name: 'a blank store product id' },
        { input: { store: 'app_store', storeProductId: 'x' }, name: 'no screenshot on the App Store' },
        {
            input: { androidBasePlanId: 'm', screenshot: 'data:image/png;base64,AA', store: 'app_store', storeProductId: 'x' },
            name: 'a base plan on the App Store',
        },
        { input: { groupId: '1', store: 'play_store', storeProductId: 'x' }, name: 'a group on Google Play' },
        { input: { screenshot: 'data:image/png;base64,AA', store: 'play_store', storeProductId: 'x' }, name: 'a screenshot on Google Play' },
    ] as const;

    for (const { input, name } of badPushes) {
        it(`refuses a push with ${name} before any request`, async () => {
            const { calls, products } = setup([]);

            expect(await rejection(products.push('a1', 'p1', input))).to.be.instanceOf(ValidationError);
            expect(calls).to.have.lengthOf(0);
        });
    }
});
