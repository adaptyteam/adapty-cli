import { expect } from 'chai';

import { createAdapty } from '../../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../../src/sdk/core/errors.js';
import { createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

import type { ProductOffer, UpdateProductOfferInput } from '../../../../src/sdk/adapty/index.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, offers: adapty.productOffers };
};

const stored = (overrides: Partial<ProductOffer> = {}): ProductOffer => ({
    duration: null,
    id: 'o1',
    offer_type: 'promotional',
    product_id: 'p1',
    store_offers: { app_store: { offer_id: 'ios_1' }, play_store: { offer_id: 'and_1' } },
    title: 'Spring',
    ...overrides,
});

describe('adapty.productOffers', () => {
    it('lists under the product without page params', async () => {
        const page = { data: [stored()], meta: { pagination: { count: 1, page: 1, pages: 1 } } };
        const { calls, offers } = setup([{ body: page }]);

        const result = await offers.list('a1', 'p1');

        expect(calls[0]?.url).to.equal(`${BASE}/apps/a1/products/p1/offers/`);
        expect(result).to.deep.equal(page);
    });

    it('creates under the product with a snake_case body and no undefined fields', async () => {
        const { calls, offers } = setup([{ body: stored(), status: 201 }]);

        await offers.create('a1', 'p1', { iosOfferId: 'ios_1', offerType: 'win_back', title: 'Back' });

        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/a1/products/p1/offers/`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ ios_offer_id: 'ios_1', offer_type: 'win_back', title: 'Back' });
    });

    it('leaves a blank store id out of the body', async () => {
        const { calls, offers } = setup([{ body: stored(), status: 201 }]);

        await offers.create('a1', 'p1', { androidOfferId: '  ', iosOfferId: ' ios_1 ', offerType: 'promotional', title: 'A' });

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ ios_offer_id: 'ios_1', offer_type: 'promotional', title: 'A' });
    });

    const badCreates = [
        { name: 'no store id', input: { offerType: 'promotional', title: 'A' } },
        { name: 'blank store ids', input: { androidOfferId: ' ', iosOfferId: '', offerType: 'promotional', title: 'A' } },
        { name: 'a blank title', input: { iosOfferId: 'x', offerType: 'promotional', title: ' ' } },
        { name: 'a win_back on Google Play', input: { androidOfferId: 'a', iosOfferId: 'i', offerType: 'win_back', title: 'A' } },
    ] as const;

    for (const { input, name } of badCreates) {
        it(`refuses a create with ${name} before any request`, async () => {
            const { calls, offers } = setup([]);

            expect(await rejection(offers.create('a1', 'p1', input))).to.be.instanceOf(ValidationError);
            expect(calls).to.have.length(0);
        });
    }

    it('reads by the offer id under the app', async () => {
        const { calls, offers } = setup([{ body: stored() }]);

        await offers.get('a1', 'o1');

        expect(calls.map(call => `${call.method} ${call.url}`)).to.deep.equal([`GET ${BASE}/apps/a1/offers/o1/`]);
    });

    describe('update', () => {
        const putBody = async (current: ProductOffer, input: UpdateProductOfferInput): Promise<unknown> => {
            const { calls, offers } = setup([{ body: current }, { body: current }]);

            await offers.update('a1', 'o1', input);

            expect(calls.map(call => call.method)).to.deep.equal(['GET', 'PUT']);
            expect(calls[1]?.url).to.equal(`${BASE}/apps/a1/offers/o1/`);

            return JSON.parse(calls[1]?.body ?? '');
        };

        const both = { android_offer_id: 'and_1', ios_offer_id: 'ios_1', offer_type: 'promotional' };

        it('answers with what the PUT returned, not the stored offer', async () => {
            const updated = stored({ title: 'Spring 2' });
            const { offers } = setup([{ body: stored() }, { body: updated }]);

            expect(await offers.update('a1', 'o1', { title: 'Spring 2' })).to.deep.equal(updated);
        });

        it('keeps both store ids when only the title changes', async () => {
            expect(await putBody(stored(), { title: 'Spring 2' })).to.deep.equal({ ...both, title: 'Spring 2' });
        });

        it('replaces one store id and keeps the other', async () => {
            expect(await putBody(stored(), { iosOfferId: 'ios_2' })).to.deep.equal({ ...both, ios_offer_id: 'ios_2', title: 'Spring' });
        });

        it('drops a side that is cleared', async () => {
            expect(await putBody(stored(), { androidOfferId: null })).to.deep.equal({
                ios_offer_id: 'ios_1',
                offer_type: 'promotional',
                title: 'Spring',
            });
        });

        it('adds a side that the offer did not have', async () => {
            const current = stored({ store_offers: { play_store: { offer_id: 'and_1' } } });

            expect(await putBody(current, { iosOfferId: 'ios_new' })).to.deep.equal({ ...both, ios_offer_id: 'ios_new', title: 'Spring' });
        });

        it('turns a promotional offer into win_back once its Google Play side is cleared', async () => {
            expect(await putBody(stored(), { androidOfferId: null, offerType: 'win_back' })).to.deep.equal({
                ios_offer_id: 'ios_1',
                offer_type: 'win_back',
                title: 'Spring',
            });
        });

        it('treats a blank id as not given and keeps the stored one', async () => {
            expect(await putBody(stored(), { iosOfferId: '', title: 'T' })).to.deep.equal({ ...both, title: 'T' });
        });

        type Refusal = { current: ProductOffer; input: UpdateProductOfferInput; message: string; name: string };

        const refusals: Refusal[] = [
            { name: 'clearing the only side', current: stored({ store_offers: { app_store: { offer_id: 'i' } } }), input: { iosOfferId: null }, message: 'at least one store offer id' },
            { name: 'clearing both sides', current: stored(), input: { androidOfferId: null, iosOfferId: null }, message: 'at least one store offer id' },
            { name: 'an introductory offer', current: stored({ offer_type: 'introductory' }), input: { title: 'x' }, message: 'introductory offers are read-only' },
            { name: 'an introductory offer turned promotional', current: stored({ offer_type: 'introductory' }), input: { offerType: 'promotional' }, message: 'introductory offers are read-only' },
            { name: 'a win_back that keeps the stored Google Play side', current: stored(), input: { offerType: 'win_back' }, message: 'clear the stored Google Play one' },
            { name: 'a Google Play id on a stored win_back', current: stored({ offer_type: 'win_back', store_offers: { app_store: { offer_id: 'i' } } }), input: { androidOfferId: 'a' }, message: 'takes only an App Store offer id' },
            { name: 'a win_back given a Google Play id', current: stored({ store_offers: { app_store: { offer_id: 'i' } } }), input: { androidOfferId: 'a', offerType: 'win_back' }, message: 'takes only an App Store offer id' },
            { name: 'an offer with only an app_store1 side', current: stored({ store_offers: { app_store1: { offer_id: 'old' } } }), input: { title: 'x' }, message: 'would drop (app_store1)' },
            { name: 'an offer with app_store1 next to app_store', current: stored({ store_offers: { app_store: { offer_id: 'i' }, app_store1: { offer_id: 'old' } } }), input: { title: 'x' }, message: 'would drop (app_store1)' },
        ];

        for (const { current, input, message, name } of refusals) {
            it(`refuses ${name} after the read and sends no PUT`, async () => {
                const { calls, offers } = setup([{ body: current }]);

                const error = await rejection(offers.update('a1', 'o1', input));

                expect(error).to.be.instanceOf(ValidationError);
                expect((error as ValidationError).issues[0]?.message).to.contain(message);
                expect(calls.map(call => call.method)).to.deep.equal(['GET']);
            });
        }

        it('refuses an update that changes nothing before any request', async () => {
            const { calls, offers } = setup([]);

            expect(await rejection(offers.update('a1', 'o1', {}))).to.be.instanceOf(ValidationError);
            expect(calls).to.have.length(0);
        });

        it('refuses an update with only blank store ids before any request', async () => {
            const { calls, offers } = setup([]);

            const error = await rejection(offers.update('a1', 'o1', { androidOfferId: ' ', iosOfferId: '' }));

            expect((error as ValidationError).issues[0]?.message).to.contain('nothing to update');
            expect(calls).to.have.length(0);
        });

        it('refuses a blank title before any request', async () => {
            const { calls, offers } = setup([]);

            const error = await rejection(offers.update('a1', 'o1', { title: ' ' }));

            expect((error as ValidationError).issues[0]).to.deep.include({ message: 'must not be empty', path: 'title' });
            expect(calls).to.have.length(0);
        });
    });
});
