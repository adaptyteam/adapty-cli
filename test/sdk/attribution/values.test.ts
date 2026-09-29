import { expect } from 'chai';

import { validateValues } from '../../../src/sdk/attribution/index.js';
import { toValuesRequest } from '../../../src/sdk/attribution/values.js';

import type { ValuesInput } from '../../../src/sdk/attribution/index.js';
import type { Issue } from '../../../src/sdk/core/errors.js';

const paths = (issues: readonly Issue[]): (string | undefined)[] => issues.map(issue => issue.path);

const valid: ValuesInput = {
    appId: '3f1c2a4e-8b7d-4c1e-9a2f-5d6e7f8a9b0c',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    dimension: 'campaign',
};

describe('validateValues', () => {
    const cases: { expected: string[]; input: ValuesInput; name: string }[] = [
        { expected: [], input: valid, name: 'campaigns over a month' },
        { expected: ['dateFrom'], input: { ...valid, dateFrom: '01-08-2026' }, name: 'a start that is not an ISO date' },
        { expected: ['dateTo'], input: { ...valid, dateTo: '2026-07-31' }, name: 'an end before the start' },
        { expected: ['dimension'], input: { ...valid, dimension: ' ' }, name: 'a blank dimension' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateValues(input))).to.deep.equal(expected);
        });
    }
});

describe('toValuesRequest', () => {
    it('spells the body in snake_case and leaves an absent revenue basis out', () => {
        expect(toValuesRequest(valid)).to.deep.equal({
            app_id: valid.appId,
            date_from: '2026-08-01',
            date_to: '2026-08-31',
            dimension: 'campaign',
        });

        expect(toValuesRequest({ ...valid, revenueBasis: 'net' })).to.have.property('revenue_basis', 'net');
    });
});
