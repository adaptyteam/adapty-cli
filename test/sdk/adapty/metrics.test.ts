import { expect } from 'chai';

import { validateMetricsInput } from '../../../src/sdk/adapty/index.js';

import type { MetricsInput } from '../../../src/sdk/adapty/index.js';

describe('validateMetricsInput', () => {
    const cases: { expected: (string | undefined)[]; input: MetricsInput; name: string }[] = [
        { expected: [], input: {}, name: 'no period' },
        { expected: [], input: { dateFrom: '2026-09-01', dateTo: '2026-09-30' }, name: 'both ends' },
        { expected: ['dateTo'], input: { dateFrom: '2026-09-01' }, name: 'a start without an end' },
        { expected: ['dateFrom'], input: { dateTo: '2026-09-30' }, name: 'an end without a start' },
        {
            expected: [],
            input: { basedOn: 'paywall', dateType: 'shown_at', granularity: 'decade', groupBy: 'product' },
            name: 'values that the server judges',
        },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(validateMetricsInput(input).map(issue => issue.path)).to.deep.equal(expected);
        });
    }
});
