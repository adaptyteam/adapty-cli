import { expect } from 'chai';

import { toChartRequest } from '../../../../src/sdk/adapty/analytics/chart.js';
import { validateChart, validateFilterValues, validateLtv } from '../../../../src/sdk/adapty/analytics/index.js';

import type { ChartInput, LtvInput } from '../../../../src/sdk/adapty/analytics/index.js';
import type { Issue } from '../../../../src/sdk/core/errors.js';

const paths = (issues: readonly Issue[]): (string | undefined)[] => issues.map(issue => issue.path);

const chart: ChartInput = {
    appId: '3f1c2a4e-8b7d-4c1e-9a2f-5d6e7f8a9b0c',
    chartId: 'revenue',
    dateFrom: '2026-07-01',
    dateTo: '2026-09-30',
};

const ltv: LtvInput = { appId: chart.appId, dateFrom: chart.dateFrom, dateTo: chart.dateTo };

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
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateChart(input))).to.deep.equal(expected);
        });
    }
});

describe('validateLtv (the renewal periods rule of LTV and cohorts)', () => {
    const cases: { expected: string[]; input: LtvInput; name: string }[] = [
        { expected: [], input: ltv, name: 'the backend defaults' },
        { expected: [], input: { ...ltv, periodType: 'days', renewalDays: [0, 7, 30] }, name: 'ascending days with the days period type' },
        { expected: ['renewalDays'], input: { ...ltv, renewalDays: [7] }, name: 'days without the days period type' },
        { expected: ['renewalDays'], input: { ...ltv, periodType: 'days', renewalDays: [30, 7] }, name: 'days out of order' },
        { expected: ['renewalDays'], input: { ...ltv, periodType: 'days', renewalDays: [7, 7] }, name: 'a day twice' },
        { expected: ['renewalDays'], input: { ...ltv, periodType: 'days', renewalDays: [-1] }, name: 'a negative day' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateLtv(input))).to.deep.equal(expected);
        });
    }

    it('names the other field as {periodType}, for the adapter to write its own way', () => {
        expect(validateLtv({ ...ltv, renewalDays: [7] })).to.deep.equal([{ message: 'needs {periodType} days', path: 'renewalDays' }]);
    });
});

describe('validateFilterValues', () => {
    it('refuses an empty dimension and takes any other name: the backend knows the list', () => {
        expect(paths(validateFilterValues({ appId: chart.appId, dimension: ' ' }))).to.deep.equal(['dimension']);
        expect(paths(validateFilterValues({ appId: chart.appId, dimension: 'country' }))).to.deep.equal([]);
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
