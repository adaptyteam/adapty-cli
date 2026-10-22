import { expect } from 'chai';

import { validateLtv } from '../../../../src/sdk/adapty/analytics/index.js';
import { toLtvRequest } from '../../../../src/sdk/adapty/analytics/ltv.js';

import { paths, quarter } from './fixtures.js';

import type { LtvInput } from '../../../../src/sdk/adapty/analytics/index.js';

describe('validateLtv (the renewal periods rule it shares with cohorts)', () => {
    const cases: { expected: string[]; input: LtvInput; name: string }[] = [
        { expected: [], input: quarter, name: 'the backend defaults' },
        { expected: [], input: { ...quarter, periodType: 'days', renewalDays: [0, 7, 30] }, name: 'ascending days with the days period type' },
        { expected: ['renewalDays'], input: { ...quarter, renewalDays: [7] }, name: 'days without the days period type' },
        { expected: ['renewalDays'], input: { ...quarter, periodType: 'days', renewalDays: [30, 7] }, name: 'days out of order' },
        { expected: ['renewalDays'], input: { ...quarter, periodType: 'days', renewalDays: [7, 7] }, name: 'a day twice' },
        { expected: ['renewalDays'], input: { ...quarter, periodType: 'days', renewalDays: [-1] }, name: 'a negative day' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateLtv(input))).to.deep.equal(expected);
        });
    }

    it('names the period type as a field, for the adapter to write its own way', () => {
        expect(validateLtv({ ...quarter, renewalDays: [7] }))
            .to.deep.equal([{ fields: ['periodType'], message: 'needs {periodType} days', path: 'renewalDays' }]);
    });
});

describe('toLtvRequest', () => {
    it('spells the renewal fields the way the backend reads them', () => {
        expect(toLtvRequest({ ...quarter, groupBy: 'country', periodType: 'days', renewalDays: [7, 30], revenueBasis: 'net' })).to.deep.equal({
            filters: { date: ['2026-07-01', '2026-09-30'] },
            period_type: 'days',
            renewal_days: [7, 30],
            revenue_basis: 'net',
            segmentation: 'country',
        });
    });
});
