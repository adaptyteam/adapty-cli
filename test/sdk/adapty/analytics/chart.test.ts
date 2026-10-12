import { expect } from 'chai';

import { toChartRequest } from '../../../../src/sdk/adapty/analytics/chart.js';
import { validateChart } from '../../../../src/sdk/adapty/analytics/index.js';

import { paths, quarter } from './fixtures.js';

import type { ChartInput } from '../../../../src/sdk/adapty/analytics/index.js';

const chart: ChartInput = { ...quarter, chartId: 'revenue' };

describe('validateChart', () => {
    const cases: { expected: string[]; input: ChartInput; name: string }[] = [
        { expected: [], input: chart, name: 'a revenue chart over a quarter' },
        { expected: [], input: { ...chart, compareFrom: '2026-04-01', compareTo: '2026-06-30' }, name: 'a compared period with both ends' },
        { expected: [], input: { ...chart, revenueBasis: 'net' }, name: 'a revenue basis for a money chart' },
        { expected: ['revenueBasis'], input: { ...chart, chartId: 'installs', revenueBasis: 'net' }, name: 'a revenue basis for a count chart' },
        { expected: ['compareTo'], input: { ...chart, compareFrom: '2026-04-01' }, name: 'a compared period without its end' },
        { expected: ['compareFrom'], input: { ...chart, compareTo: '2026-06-30' }, name: 'a compared period without its start' },
        { expected: ['compareTo'], input: { ...chart, compareFrom: '2026-06-30', compareTo: '2026-04-01' }, name: 'a compared end before its start' },
        { expected: ['dateTo'], input: { ...chart, dateTo: '2026-02-30' }, name: 'an end that is not a calendar day' },
        { expected: ['filter'], input: { ...chart, filters: [{ dimension: 'date', values: ['2026-07-01'] }] }, name: 'the period as a filter' },
        { expected: [], input: { ...chart, filters: [{ dimension: 'country', values: [''] }] }, name: 'the "No Data" value as a filter' },
        {
            expected: ['dateTo', 'revenueBasis'],
            input: { ...chart, chartId: 'trials_new', dateTo: '2026-06-30', revenueBasis: 'gross' },
            name: 'every problem at once',
        },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateChart(input))).to.deep.equal(expected);
        });
    }

    it('names the other end of a compared period as a field, for the adapter to write its own way', () => {
        expect(validateChart({ ...chart, compareFrom: '2026-04-01' }))
            .to.deep.equal([{ fields: ['compareFrom'], message: 'required with {compareFrom}', path: 'compareTo' }]);
    });
});

describe('toChartRequest', () => {
    it('spells every field the way the backend reads it, and merges two filters of one dimension', () => {
        const body = toChartRequest({
            ...chart,
            compareFrom: '2026-04-01',
            compareTo: '2026-06-30',
            filters: [{ dimension: 'country', values: ['US', ''] }, { dimension: 'country', values: ['', 'DE'] }],
            granularity: 'week',
            groupBy: 'paywall_id',
            revenueBasis: 'proceeds',
            timezone: 'Europe/Berlin',
        });

        expect(body).to.deep.equal({
            chart_id: 'revenue',
            filters: { compare_date: ['2026-04-01', '2026-06-30'], country: ['US', '', 'DE'], date: ['2026-07-01', '2026-09-30'] },
            period_unit: 'week',
            revenue_basis: 'proceeds',
            segmentation: 'paywall_id',
            timezone: 'Europe/Berlin',
        });
    });

    it('leaves out what was not given, so the backend default applies', () => {
        expect(toChartRequest(chart)).to.deep.equal({ chart_id: 'revenue', filters: { date: ['2026-07-01', '2026-09-30'] } });
    });
});
