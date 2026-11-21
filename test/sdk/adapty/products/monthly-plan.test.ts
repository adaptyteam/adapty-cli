import { expect } from 'chai';

import { createAdapty } from '../../../../src/sdk/adapty/index.js';
import { fittingMonthlyPrices, monthlyPlanPrices } from '../../../../src/sdk/adapty/products/index.js';
import { ValidationError } from '../../../../src/sdk/core/errors.js';
import { createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

import type { Product } from '../../../../src/sdk/adapty/index.js';

const BASE = 'https://api.example.com/v1';

const annual = (overrides: Partial<Product> = {}): Product => ({
    access_level_id: 'al1',
    app_store_monthly_plan: null,
    id: 'p1',
    offers_count: 0,
    period: 'annual',
    price_usd: 59.99,
    title: 'Yearly',
    vendor_products: { app_store: { base_plan_id: null, id: 'v1', product_id: 'com.example.yearly', store_status: 'approved' } },
    ...overrides,
});

describe('adapty.products monthly plan', () => {
    // external: the prices an agent is told to pick from; a point outside them is refused by the server
    const corridor: { annual: number; expected: number[]; id: string; points: number[] }[] = [
        { annual: 59.99, expected: [5, 5.49, 7.49], id: 'both-bounds-kept', points: [4.99, 5, 5.49, 7.49, 7.5] },
        { annual: 59.99, expected: [], id: 'just-outside-both-bounds', points: [4.99, 7.5] },
        { annual: 12, expected: [1, 1.5], id: 'whole-dollar-annual', points: [0.99, 1, 1.5, 1.51] },
        { annual: 0.29, expected: [], id: 'too-low-for-any-point', points: [0.29, 0.39] },
        { annual: 99.99, expected: [8.99, 12.49], id: 'float-cents-rounding', points: [8.33, 8.99, 12.49, 12.5] },
    ];

    for (const row of corridor) {
        it(`fittingMonthlyPrices: ${row.id}`, () => {
            expect(fittingMonthlyPrices(row.annual, row.points), row.id).to.deep.equal(row.expected);
        });
    }

    // external: the refusal code that the price list shows, in the order the server checks
    const eligibility: { expected: unknown; id: string; product: Product }[] = [
        { expected: { refusal: 'monthly_plan_requires_annual_product' }, id: 'monthly-period', product: annual({ period: 'monthly', vendor_products: {} }) },
        { expected: { refusal: 'monthly_plan_requires_product_price' }, id: 'price-zero', product: annual({ price_usd: 0 }) },
        { expected: { refusal: 'monthly_plan_requires_product_price' }, id: 'price-null', product: annual({ price_usd: null }) },
        { expected: { refusal: 'monthly_plan_has_no_price_points' }, id: 'no-point', product: annual({ price_usd: 0.99, vendor_products: {} }) },
        { expected: { refusal: 'monthly_plan_requires_app_store_product' }, id: 'no-app-store', product: annual({ vendor_products: {} }) },
        { expected: { annual_price_usd: 59.99, prices: [5.99] }, id: 'eligible', product: annual() },
    ];

    for (const row of eligibility) {
        it(`monthlyPlanPrices: ${row.id}`, () => {
            const list = { product_prices: [0.29, 5.99, 9.99] };

            expect(monthlyPlanPrices(row.product, list), row.id).to.deep.equal(row.expected);
        });
    }

    it('setMonthlyPlan PUTs the price to the plan route, priceList GETs the constants of the app', async () => {
        const scripted = createScriptedFetch([{ body: { price_usd: 5.99, vendor_product_id: 'vp' } }, { body: { product_prices: [5.99] } }]);
        const { products } = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

        await products.setMonthlyPlan('a1', 'p1', { priceUsd: 5.99 });
        await products.priceList('a1');

        expect(scripted.calls.map(call => `${call.method} ${call.url} ${call.body ?? ''}`)).to.deep.equal([
            `PUT ${BASE}/apps/a1/products/p1/app-store-monthly-plan/ {"price_usd":5.99}`,
            `GET ${BASE}/apps/a1/constants/ `,
        ]);
    });

    it('setMonthlyPlan refuses a price that is not a number before any request', async () => {
        const scripted = createScriptedFetch([]);
        const { products } = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

        expect(await rejection(products.setMonthlyPlan('a1', 'p1', { priceUsd: Number.NaN }))).to.be.instanceOf(ValidationError);
        expect(scripted.calls).to.have.length(0);
    });
});
