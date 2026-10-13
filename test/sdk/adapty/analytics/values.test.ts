import { expect } from 'chai';

import { validateFilterValues } from '../../../../src/sdk/adapty/analytics/index.js';

import { paths, quarter } from './fixtures.js';

describe('validateFilterValues', () => {
    it('refuses an empty dimension and takes any other name: the backend knows the list', () => {
        expect(paths(validateFilterValues({ appId: quarter.appId, dimension: ' ' }))).to.deep.equal(['dimension']);
        expect(paths(validateFilterValues({ appId: quarter.appId, dimension: 'country' }))).to.deep.equal([]);
    });
});
