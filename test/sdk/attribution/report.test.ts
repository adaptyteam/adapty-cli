import { expect } from 'chai';

import { validateReport } from '../../../src/sdk/attribution/index.js';
import { toReportRequest } from '../../../src/sdk/attribution/report.js';

import type { ReportInput } from '../../../src/sdk/attribution/index.js';
import type { Issue } from '../../../src/sdk/core/errors.js';

const paths = (issues: readonly Issue[]): (string | undefined)[] => issues.map(issue => issue.path);

const valid: ReportInput = {
    appId: '3f1c2a4e-8b7d-4c1e-9a2f-5d6e7f8a9b0c',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    groupBy: ['campaign'],
    metrics: ['spend', 'installs'],
};

describe('validateReport', () => {
    const cases: { expected: string[]; input: ReportInput; name: string }[] = [
        { expected: [], input: valid, name: 'a campaign report over a month' },
        { expected: [], input: { ...valid, dateTo: valid.dateFrom }, name: 'one day: start equal to end' },
        { expected: [], input: { ...valid, granularity: 'week', groupBy: ['date', 'country'] }, name: 'granularity with date grouped' },
        { expected: ['dateFrom'], input: { ...valid, dateFrom: '2026/08/01' }, name: 'a start that is not an ISO date' },
        { expected: ['dateTo'], input: { ...valid, dateTo: '2026-02-30' }, name: 'an end that is not a calendar day' },
        { expected: ['dateTo'], input: { ...valid, dateFrom: '2026-09-01', dateTo: '2026-08-31' }, name: 'an end before the start' },
        { expected: ['metrics'], input: { ...valid, metrics: [] }, name: 'no metrics' },
        { expected: ['groupBy'], input: { ...valid, groupBy: [] }, name: 'no grouping' },
        { expected: ['granularity'], input: { ...valid, granularity: 'day' }, name: 'granularity without date grouped' },
        {
            expected: ['dateTo', 'metrics', 'groupBy'],
            input: { ...valid, dateFrom: '2026-09-01', dateTo: '2026-08-01', groupBy: [], metrics: [] },
            name: 'every problem at once',
        },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateReport(input))).to.deep.equal(expected);
        });
    }
});

describe('toReportRequest', () => {
    it('spells every field the way the backend reads it', () => {
        const body = toReportRequest({
            ...valid,
            filters: [{ dimension: 'country', values: ['US', 'DE'] }],
            granularity: 'month',
            groupBy: ['date', 'campaign'],
            revenueBasis: 'proceeds',
            sort: { direction: 'desc', field: 'spend' },
        });

        expect(body).to.deep.equal({
            app_id: valid.appId,
            date_from: '2026-08-01',
            date_to: '2026-08-31',
            filters: [{ dimension: 'country', values: ['US', 'DE'] }],
            granularity: 'month',
            group_by: ['date', 'campaign'],
            metrics: ['spend', 'installs'],
            revenue_basis: 'proceeds',
            sort: { direction: 'desc', field: 'spend' },
        });
    });

    it('leaves an optional field out when it was not given', () => {
        expect(Object.keys(toReportRequest(valid)).sort()).to.deep.equal([
            'app_id', 'date_from', 'date_to', 'group_by', 'metrics',
        ]);
    });
});
