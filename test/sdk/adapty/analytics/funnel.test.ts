import { expect } from 'chai';

import { toFunnelRequest } from '../../../../src/sdk/adapty/analytics/funnel.js';
import { validateFunnel } from '../../../../src/sdk/adapty/analytics/index.js';

import { paths, quarter } from './fixtures.js';

import type { FunnelInput } from '../../../../src/sdk/adapty/analytics/index.js';

describe('validateFunnel', () => {
    const cases: { expected: string[]; input: FunnelInput; name: string }[] = [
        { expected: [], input: quarter, name: 'a quarter' },
        { expected: [], input: { ...quarter, groupBy: 'country', filters: [{ dimension: 'paywall_id', values: ['p1'] }] }, name: 'grouped and filtered' },
        { expected: ['dateTo'], input: { ...quarter, dateFrom: '2026-09-30', dateTo: '2026-07-01' }, name: 'an end before the start' },
        { expected: ['filter'], input: { ...quarter, filters: [{ dimension: 'compare_date', values: ['2026-04-01'] }] }, name: 'a compared period as a filter' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateFunnel(input))).to.deep.equal(expected);
        });
    }
});

describe('toFunnelRequest', () => {
    it('sends the grouping as segmentation and the time zone when given', () => {
        expect(toFunnelRequest({ ...quarter, groupBy: 'store', timezone: 'UTC' })).to.deep.equal({
            filters: { date: ['2026-07-01', '2026-09-30'] },
            segmentation: 'store',
            timezone: 'UTC',
        });
    });
});
