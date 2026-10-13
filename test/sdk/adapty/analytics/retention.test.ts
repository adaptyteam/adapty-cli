import { expect } from 'chai';

import { validateRetention } from '../../../../src/sdk/adapty/analytics/index.js';
import { toRetentionRequest } from '../../../../src/sdk/adapty/analytics/retention.js';

import { paths, quarter } from './fixtures.js';

import type { RetentionInput } from '../../../../src/sdk/adapty/analytics/index.js';

describe('validateRetention', () => {
    const cases: { expected: string[]; input: RetentionInput; name: string }[] = [
        { expected: [], input: quarter, name: 'a quarter' },
        { expected: [], input: { ...quarter, groupBy: 'country', useTrial: true }, name: 'grouped, counted from the trial' },
        { expected: ['dateFrom', 'dateTo'], input: { ...quarter, dateFrom: '2026-02-30', dateTo: 'tomorrow' }, name: 'two dates that are no days' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateRetention(input))).to.deep.equal(expected);
        });
    }
});

describe('toRetentionRequest', () => {
    it('sends use_trial only when given, so the backend default applies otherwise', () => {
        expect(toRetentionRequest({ ...quarter, useTrial: true })).to.deep.equal({ filters: { date: ['2026-07-01', '2026-09-30'] }, use_trial: true });
        expect(toRetentionRequest(quarter)).to.deep.equal({ filters: { date: ['2026-07-01', '2026-09-30'] } });
    });
});
