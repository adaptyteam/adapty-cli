import { expect } from 'chai';

import { toCohortRequest } from '../../../../src/sdk/adapty/analytics/cohort.js';
import { validateCohort } from '../../../../src/sdk/adapty/analytics/index.js';

import { paths, quarter } from './fixtures.js';

import type { CohortInput } from '../../../../src/sdk/adapty/analytics/index.js';

describe('validateCohort', () => {
    const cases: { expected: string[]; input: CohortInput; name: string }[] = [
        { expected: [], input: quarter, name: 'monthly cohorts by default' },
        { expected: [], input: { ...quarter, granularity: 'week', periodType: 'days', renewalDays: [3, 7] }, name: 'weekly cohorts by days' },
        { expected: ['renewalDays'], input: { ...quarter, periodType: 'renewals', renewalDays: [7] }, name: 'days with the renewals period type' },
        { expected: ['dateTo', 'renewalDays'], input: { ...quarter, dateTo: '2026-06-30', renewalDays: [7] }, name: 'every problem at once' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateCohort(input))).to.deep.equal(expected);
        });
    }
});

describe('toCohortRequest', () => {
    it('sends the cohort length as period_unit', () => {
        expect(toCohortRequest({ ...quarter, granularity: 'week', revenueBasis: 'proceeds' })).to.deep.equal({
            filters: { date: ['2026-07-01', '2026-09-30'] },
            period_unit: 'week',
            revenue_basis: 'proceeds',
        });
    });
});
