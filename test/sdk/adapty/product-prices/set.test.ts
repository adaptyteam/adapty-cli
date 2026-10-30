import { expect } from 'chai';

import { toPreviewRequest, validatePreviewPrices } from '../../../../src/sdk/adapty/product-prices/set.js';

describe('validatePreviewPrices', () => {
    it('names a row by its file line when it has one, else by its place', () => {
        const rows = [{ appStorePrice: 1, line: 7, regionCode: 'D' }, { appStorePrice: 1, regionCode: 'F' }];

        expect(validatePreviewPrices({ rows }).map(issue => issue.message)).to.deep.equal([
            'line 7: the country code must be 2 letters, e.g. DE',
            'row 2: the country code must be 2 letters, e.g. DE',
        ]);
    });

    it('refuses a non-ASCII country or currency', () => {
        expect(validatePreviewPrices({ rows: [{ appStorePrice: 1, regionCode: 'ß' }] })).to.have.length(1);
        expect(validatePreviewPrices({ rows: [{ appStoreCurrency: 'EUß', appStorePrice: 1, regionCode: 'DE' }] })).to.have.length(1);
    });
});

describe('toPreviewRequest', () => {
    it('does not send the file line', () => {
        expect(toPreviewRequest({ rows: [{ appStorePrice: 9.99, line: 3, regionCode: 'DE' }] }))
            .to.deep.equal({ rows: [{ app_store_price: 9.99, region_code: 'DE' }] });
    });
});
