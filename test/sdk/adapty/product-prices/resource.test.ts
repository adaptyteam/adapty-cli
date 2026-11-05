import { expect } from 'chai';

import { createAdapty, decideSave } from '../../../../src/sdk/adapty/index.js';
import { validatePreviewPrices } from '../../../../src/sdk/adapty/product-prices/index.js';
import { ValidationError } from '../../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

import type { PricePreview, PriceRow } from '../../../../src/sdk/adapty/index.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const clock = createFakeClock();
    const adapty = createAdapty({ baseUrl: BASE, clock, fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, clock, prices: adapty.productPrices };
};

const row = (overrides: Partial<PriceRow> = {}): PriceRow => ({
    app_store_currency: 'EUR',
    app_store_requested_price: 9.99,
    app_store_sync_error: null,
    app_store_sync_status: 'pending',
    app_store_synced_price: null,
    play_store_currency: null,
    play_store_requested_price: null,
    play_store_sync_error: null,
    play_store_sync_status: null,
    play_store_synced_price: null,
    region_code: 'DE',
    region_name: 'Germany',
    ...overrides,
});

const list = (...rows: PriceRow[]) => ({
    body: { data: rows, meta: { pagination: { count: rows.length, page: 1, pages: 1 } } },
});

const preview = (overrides: Partial<PricePreview> = {}): PricePreview => ({
    data: { rows: [] },
    difference: { rows: [] },
    errors: [],
    ...overrides,
});

describe('adapty.productPrices', () => {
    it('previews with a snake_case body that leaves out what is not given', async () => {
        const { calls, prices } = setup([{ body: preview() }]);

        await prices.preview('a1', 'p1', { rows: [{ appStorePrice: 9.99, regionCode: 'DE' }] });

        expect(`${calls[0]?.method} ${calls[0]?.url}`).to.equal(`POST ${BASE}/apps/a1/products/p1/prices/preview/`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ rows: [{ app_store_price: 9.99, region_code: 'DE' }] });
    });

    it('saves the rows it is given with the subscriber flag in the body', async () => {
        const { calls, prices } = setup([{ body: { saved_rows: 1 }, status: 201 }]);

        const saved = await prices.save('a1', 'p1', {
            applyToExistingSubscribers: true,
            rows: [{ app_store_price: 9.99, region_code: 'DE' }],
        });

        expect(`${calls[0]?.method} ${calls[0]?.url}`).to.equal(`POST ${BASE}/apps/a1/products/p1/prices/`);

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({
            apply_to_existing_subscribers: true,
            rows: [{ app_store_price: 9.99, region_code: 'DE' }],
        });

        expect(saved.saved_rows).to.equal(1);
    });

    const badPreviews = [
        { name: 'no rows', rows: [] },
        { name: 'a blank country', rows: [{ appStorePrice: 1, regionCode: ' ' }] },
        { name: 'a lower-case country', rows: [{ appStorePrice: 1, regionCode: 'de' }] },
        { name: 'a 3-letter country', rows: [{ appStorePrice: 1, regionCode: 'DEU' }] },
        { name: 'a lower-case currency', rows: [{ appStoreCurrency: 'eur', appStorePrice: 1, regionCode: 'DE' }] },
        { name: 'a 2-letter currency', rows: [{ playStoreCurrency: 'EU', playStorePrice: 1, regionCode: 'DE' }] },
        { name: 'no price', rows: [{ regionCode: 'DE' }] },
        { name: 'a price of 0', rows: [{ appStorePrice: 0, regionCode: 'DE' }] },
        { name: 'a price that is not a number', rows: [{ playStorePrice: Number.NaN, regionCode: 'DE' }] },
    ];

    for (const { name, rows } of badPreviews) {
        it(`refuses a preview with ${name} before any request`, async () => {
            const { calls, prices } = setup([]);

            expect(await rejection(prices.preview('a1', 'p1', { rows }))).to.be.instanceOf(ValidationError);
            expect(calls).to.have.lengthOf(0);
        });
    }

    it('names the row and the rule a country code or a currency breaks', () => {
        expect(validatePreviewPrices({ rows: [{ appStorePrice: 1, regionCode: 'DE' }, { appStorePrice: 1, regionCode: 'de' }] }))
            .to.deep.equal([{ message: 'row 2: the country code must be 2 letters, e.g. DE' }]);

        expect(validatePreviewPrices({ rows: [{ appStoreCurrency: 'eur', appStorePrice: 1, regionCode: 'DE' }] }))
            .to.deep.equal([{ message: 'row 1: a currency must be 3 upper-case letters, e.g. EUR' }]);
    });

    it('decides a save from the preview: errors stop it, no difference has nothing to save', () => {
        const changed = { app_store_proposed_price: 9.99, region_code: 'DE', region_name: 'Germany' };

        expect([
            decideSave(preview({ errors: [{ error_code: 'invalid_price', message: 'x' }] })),
            decideSave(preview()),
            decideSave(preview({ difference: { rows: [changed] } })),
        ]).to.deep.equal(['row_errors', 'no_changes', 'ready']);
    });

    describe('waitFor', () => {
        const saved = [{ app_store_price: 9.99, region_code: 'DE' }];

        it('answers at once when nothing is pending', async () => {
            const { calls, clock, prices } = setup([list(row({ app_store_sync_status: 'synced' }))]);

            const result = await prices.waitFor('a1', 'p1', saved);

            expect(calls).to.have.lengthOf(1);
            expect(clock.sleeps).to.deep.equal([]);
            expect(result.map(price => price.status)).to.deep.equal(['synced']);
        });

        it('polls every 10 seconds until the row leaves pending', async () => {
            const { calls, clock, prices } = setup([
                list(row()),
                list(row()),
                list(row({ app_store_sync_error: 'Price point not found', app_store_sync_status: 'failed' })),
            ]);

            const result = await prices.waitFor('a1', 'p1', saved);

            expect(calls).to.have.lengthOf(3);
            expect(clock.sleeps).to.deep.equal([10_000, 10_000]);
            expect(result[0]).to.include({ error: 'Price point not found', status: 'failed' });
        });

        it('gives up at the budget and answers the last read, which is not an error', async () => {
            const { calls, clock, prices } = setup([list(row()), list(row()), list(row())]);

            const result = await prices.waitFor('a1', 'p1', saved, { timeoutMs: 25_000 });

            expect(calls).to.have.lengthOf(3);
            expect(clock.sleeps).to.deep.equal([10_000, 10_000]);
            expect(result[0]?.status).to.equal('pending');
        });

        it('follows only the countries and stores of the save', async () => {
            const other = row({ play_store_sync_status: 'pending', region_code: 'FR' });
            const both = row({ app_store_sync_status: 'synced', play_store_sync_status: 'pending' });
            const { prices } = setup([list(other, both)]);

            const result = await prices.waitFor('a1', 'p1', saved);

            expect(result.map(price => `${price.region_code} ${price.store} ${String(price.status)}`)).to.deep.equal(['DE app_store synced']);
        });
    });
});
