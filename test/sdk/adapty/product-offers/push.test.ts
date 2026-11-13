import { expect } from 'chai';

import { createAdapty } from '../../../../src/sdk/adapty/index.js';
import { validatePushOffer } from '../../../../src/sdk/adapty/product-offers/index.js';
import { ApiError, ValidationError } from '../../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

import type { OfferPushResult, PushOfferBody, PushOfferInput } from '../../../../src/sdk/adapty/index.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const clock = createFakeClock();
    const adapty = createAdapty({ baseUrl: BASE, clock, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, clock, offers: adapty.productOffers };
};

const BODY: PushOfferBody = {
    offer_type: 'introductory',
    payment_mode: 'free_trial',
    period: 'one_week',
    title: 'Free week',
};

const INPUT: PushOfferInput = { body: BODY, store: 'app_store' };

const pushed = (created: number, unfinished: string[] = [], skipped = 0): OfferPushResult => ({
    offer: { duration: null, id: 'o1', offer_type: 'introductory', product_id: 'p1', store_offers: {}, title: 'Free week' },
    store_result: {
        created,
        failed: unfinished.length,
        failures: unfinished.map(region => ({ error_code: 'deadline_exceeded', message: 'not finished in time', region_code: region })),
        skipped,
        store_offer_id: 'intro',
    },
});

const PREVIEW = { errors: [], regions: [], store_offer_id: 'intro', warnings: [] };

describe('adapty.productOffers push', () => {
    it('previews with the body as given, under the store of the input', async () => {
        const { calls, offers } = setup([{ body: PREVIEW }]);

        const body = { ...BODY, future_field: { kept: true } };

        await offers.previewPush('a1', 'p1', { body, store: 'play_store' });

        expect(`${calls[0]?.method} ${calls[0]?.url}`).to.equal(`POST ${BASE}/apps/a1/products/p1/offers/push/play_store/preview/`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal(body);
    });

    it('repeats a preview after a 5xx: it writes nothing', async () => {
        const { calls, offers } = setup([{ status: 503 }, { body: PREVIEW }]);

        const preview = await offers.previewPush('a1', 'p1', INPUT);

        expect(calls).to.have.length(2);
        expect(preview).to.deep.equal(PREVIEW);
    });

    it('never repeats a push on its own after a 5xx: the store may already hold regions', async () => {
        const { calls, offers } = setup([{ status: 503 }, { body: pushed(1) }]);

        const error = await rejection(offers.push('a1', 'p1', INPUT));

        expect(error).to.be.instanceOf(ApiError);
        expect(calls).to.have.length(1);
        expect(`${calls[0]?.method} ${calls[0]?.url}`).to.equal(`POST ${BASE}/apps/a1/products/p1/offers/push/app_store/`);
    });

    it('pushUntilDone pushes again while a region is unfinished, and stops when none is', async () => {
        const { calls, clock, offers } = setup([
            { body: pushed(80, ['DE', 'FR']) },
            { body: pushed(1, ['FR'], 80) },
            { body: pushed(1, [], 81) },
        ]);

        const seen: number[] = [];

        const last = await offers.pushUntilDone('a1', 'p1', INPUT, { onPoll: result => seen.push(result.store_result.created) });

        expect(calls).to.have.length(3);
        expect(new Set(calls.map(call => call.body))).to.have.property('size', 1);
        expect(seen).to.deep.equal([80, 1]);
        expect(last.store_result.failures).to.deep.equal([]);
        expect(clock.sleeps).to.deep.equal([1000, 1000]);
    });

    it('pushUntilDone stops at a failure that is not a deadline: a repeat would not change it', async () => {
        const result = pushed(3);
        result.store_result.failed = 1;
        result.store_result.failures = [{ error_code: 'price_point_missing', message: 'no price point', region_code: 'BR' }];

        const { calls, offers } = setup([{ body: result }]);

        const last = await offers.pushUntilDone('a1', 'p1', INPUT);

        expect(calls).to.have.length(1);
        expect(last).to.deep.equal(result);
    });

    it('pushUntilDone returns the last answer when the budget runs out', async () => {
        const { calls, offers } = setup([{ body: pushed(5, ['DE']) }, { body: pushed(0, ['DE'], 5) }]);

        const last = await offers.pushUntilDone('a1', 'p1', INPUT, { timeoutMs: 1500 });

        expect(calls).to.have.length(2);
        expect(last.store_result.failures).to.have.length(1);
    });

    it('refuses a broken body before any request', async () => {
        const { calls, offers } = setup([]);

        const error = await rejection(offers.push('a1', 'p1', { body: { ...BODY, title: ' ' }, store: 'app_store' }));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });
});

describe('validatePushOffer', () => {
    const paths = (body: Record<string, unknown>, store: PushOfferInput['store'] = 'app_store'): (string | undefined)[] =>
        validatePushOffer({ body, store }).map(issue => issue.path);

    it('takes a complete body of either store', () => {
        expect(paths(BODY)).to.deep.equal([]);

        expect(paths({
            ...BODY,
            google: { discount_percent: 20, eligibility: 'acquisition', offer_tags: ['spring'] },
            number_of_periods: 3,
            offer_type: 'promotional',
            payment_mode: 'pay_as_you_go',
            price: { amount: '4.99', currency: 'EUR', rounding: 'up' },
            region_prices: [{ amount: '3.99', region_code: 'DE' }],
            regions: ['DE', 'US'],
            start_date: '2026-12-01',
            store_offer_id: 'spring-50',
        }, 'play_store')).to.deep.equal([]);
    });

    const cases: { body: Record<string, unknown>; name: string; path: string; store?: PushOfferInput['store'] }[] = [
        { body: { ...BODY, title: undefined }, name: 'no title', path: 'title' },
        { body: { ...BODY, offer_type: 'trial' }, name: 'an unknown type', path: 'offer_type' },
        { body: { ...BODY, offer_type: 'win_back', store_offer_id: 'wb' }, name: 'win_back on Google Play', path: 'offer_type', store: 'play_store' },
        { body: { ...BODY, payment_mode: undefined }, name: 'no payment mode', path: 'payment_mode' },
        { body: { ...BODY, period: 'one_day' }, name: 'an unknown period', path: 'period' },
        { body: { ...BODY, number_of_periods: 13 }, name: '13 periods', path: 'number_of_periods' },
        { body: { ...BODY, number_of_periods: 2, payment_mode: 'pay_up_front' }, name: 'pay_up_front over 2 periods', path: 'number_of_periods' },
        { body: { ...BODY, store_offer_id: 'intro' }, name: 'an id on an App Store intro offer', path: 'store_offer_id' },
        { body: { ...BODY, offer_type: 'promotional', store_offer_id: 'Spring_50' }, name: 'a Google id with capitals', path: 'store_offer_id', store: 'play_store' },
        { body: { ...BODY, price: { amount: 4.99 } }, name: 'a number as the amount', path: 'price.amount' },
        { body: { ...BODY, price: { amount: '4.99', currency: 'eur' } }, name: 'a lower-case currency', path: 'price.currency' },
        { body: { ...BODY, region_prices: [{ amount: '1', region_code: 'DEU' }] }, name: 'a 3-letter region price', path: 'region_prices' },
        { body: { ...BODY, regions: ['us'] }, name: 'a lower-case region', path: 'regions' },
        { body: { ...BODY, end_date: '2026-01-01', start_date: '2026-02-01' }, name: 'an end before the start', path: 'end_date' },
        { body: { ...BODY, start_date: '2026-02-30' }, name: 'a day that does not exist', path: 'start_date' },
        { body: { ...BODY, win_back: { paid_subscription_months: 3 } }, name: 'win-back fields on an intro offer', path: 'win_back' },
        { body: { ...BODY, google: { eligibility: 'acquisition' } }, name: 'Google fields on the App Store', path: 'google' },
        { body: { ...BODY, google: { discount_percent: 100 } }, name: 'a 100% discount', path: 'google.discount_percent', store: 'play_store' },
    ];

    for (const { body, name, path, store } of cases) {
        it(`refuses ${name}`, () => {
            expect(paths(body, store)).to.include(path);
        });
    }
});
