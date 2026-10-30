import { expect } from 'chai';

import { rowOfFlags, rowsOfCsv } from '../../../../../src/cli/commands/product-prices/set/lib/rows.js';
import { renderPricesCsv } from '../../../../../src/cli/views/product-prices.js';
import { validatePreviewPrices } from '../../../../../src/sdk/adapty/product-prices/index.js';
import { ValidationError } from '../../../../../src/sdk/core/errors.js';

const HEADER = 'region_name,region_code,app_store_currency,app_store_requested_price,play_store_currency,play_store_requested_price';

const failure = (text: string): string => {
    try {
        rowsOfCsv(text);
    } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);

        return (error as ValidationError).issues.map(issue => `${issue.path}: ${issue.message}`).join('; ');
    }

    throw new Error('rowsOfCsv did not throw');
};

describe('rowsOfCsv', () => {
    it('reads the requested prices and upper-cases the country code', () => {
        expect(rowsOfCsv(`${HEADER}\nGermany, de ,EUR,9.99,EUR,10\n`)).to.deep.equal([{
            appStoreCurrency: 'EUR',
            appStorePrice: 9.99,
            line: 2,
            playStoreCurrency: 'EUR',
            playStorePrice: 10,
            regionCode: 'DE',
            regionName: 'Germany',
        }]);
    });

    it('upper-cases a lower-case currency', () => {
        expect(rowsOfCsv(`${HEADER}\nGermany,DE, eur ,9.99,,\n`)[0]?.appStoreCurrency).to.equal('EUR');
    });

    it('skips a row with neither requested price', () => {
        expect(rowsOfCsv(`${HEADER}\nGermany,DE,EUR,,EUR,\nFrance,FR,EUR,8,,\n`).map(row => row.regionCode)).to.deep.equal(['FR']);
    });

    it('keeps a row with a price and an empty country code, for the sdk to refuse', () => {
        expect(rowsOfCsv(`${HEADER}\nGermany,,EUR,9.99,,\n`)[0]?.regionCode).to.equal('');
    });

    it('refuses a file without a region_code column', () => {
        expect(failure('country,price\nDE,1\n')).to.equal('file: has no region_code column: use the CSV of `product-prices list --csv`');
    });

    it('refuses a file with neither requested price column, naming both', () => {
        expect(failure('region_name,region_code,app_store_synced_price\nGermany,DE,9.99\n')).to.equal(
            'file: has neither an app_store_requested_price nor a play_store_requested_price column: '
            + 'use the CSV of `product-prices list --csv`',
        );
    });

    it('keeps the line of each row in the file, for the sdk to name it', () => {
        const rows = rowsOfCsv(`${HEADER}\nGermany,DE,EUR,,EUR,\n\nFrance,FR,EUR,8,,\nSpain,ESP,EUR,8,,\n`);

        expect(rows.map(row => row.line)).to.deep.equal([4, 5]);
        expect(validatePreviewPrices({ rows })).to.deep.equal([{ message: 'line 5: the country code must be 2 letters, e.g. DE' }]);
    });

    for (const code of ['ß', 'ıd']) {
        it(`does not turn the country "${code}" into ASCII letters, for the sdk to refuse`, () => {
            const rows = rowsOfCsv(`${HEADER}\nX,${code},EUR,9.99,,\n`);

            expect(rows[0]?.regionCode).to.not.equal(code.toUpperCase());
            expect(validatePreviewPrices({ rows })).to.have.length(1);
        });
    }

    it('reads back what `product-prices list --csv` writes', () => {
        const listed = {
            app_store_currency: 'EUR',
            app_store_requested_price: 3990,
            app_store_sync_error: null,
            app_store_sync_status: 'synced',
            app_store_synced_price: 3990,
            play_store_currency: null,
            play_store_requested_price: null,
            play_store_sync_error: null,
            play_store_sync_status: null,
            play_store_synced_price: null,
            region_code: 'DE',
            region_name: 'Germany, "Federal" Republic of',
        };

        expect(rowsOfCsv(renderPricesCsv([listed, { ...listed, app_store_requested_price: null, region_code: 'FR' }]))).to.deep.equal([{
            appStoreCurrency: 'EUR',
            appStorePrice: 3990,
            line: 2,
            playStoreCurrency: undefined,
            playStorePrice: undefined,
            regionCode: 'DE',
            regionName: 'Germany, "Federal" Republic of',
        }]);
    });

    for (const value of ['abc', '0x10', '1e3', '-1', 'Infinity', '9,99']) {
        it(`refuses the price "${value}", naming the line, the column and the value`, () => {
            const csv = `${HEADER}\n\nFrance,FR,EUR,8,,\nGermany,DE,EUR,"${value}",,\n`;

            expect(failure(csv)).to.equal(`file: line 4, app_store_requested_price: expected a number, got "${value}"`);
        });
    }
});

describe('rowOfFlags', () => {
    it('trims and upper-cases the country', () => {
        expect(rowOfFlags({ 'app-store-price': 1, 'country': ' de ' }).regionCode).to.equal('DE');
    });

    it('upper-cases ASCII letters only, so "ß" does not become "SS"', () => {
        const row = rowOfFlags({ 'app-store-currency': 'euß', 'app-store-price': 1, 'country': 'ß' });

        expect([row.regionCode, row.appStoreCurrency]).to.deep.equal(['ß', 'EUß']);
    });

    it('trims and upper-cases the currencies, and leaves an empty one out', () => {
        const row = rowOfFlags({ 'app-store-currency': ' eur ', 'app-store-price': 1, 'country': 'DE', 'play-store-currency': ' ' });

        expect([row.appStoreCurrency, row.playStoreCurrency]).to.deep.equal(['EUR', undefined]);
    });
});
