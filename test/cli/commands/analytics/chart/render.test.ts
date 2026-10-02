import { expect } from 'chai';

import { renderChart, renderCsv } from '../../../../../src/cli/commands/analytics/chart/lib/render.js';
import { revenueByCountry } from '../../../../fixtures/analytics-chart.js';

import type { ChartResponse, ChartSegment } from '../../../../../src/sdk/adapty/index.js';

const withSegments = (segments: ChartSegment[], unit: string | undefined = 'USD'): ChartResponse => ({
    ...revenueByCountry,
    data: { ...revenueByCountry.data, segments, unit },
});

/** `test/commands/analytics.test.ts` covers what the command puts in; the view's branches are here. */
describe('analytics chart render', () => {
    describe('renderChart', () => {
        it('prints a heading, then one aligned row per segment and one column per period start', () => {
            expect(renderChart(revenueByCountry)).to.equal([
                'Revenue, gross, USD',
                '2026-09-01 – 2026-09-28, week, timezone Europe/Berlin',
                '',
                '          Total  2026-09-01  2026-09-08  2026-09-15  2026-09-22',
                'Total  48210.40    11902.10    12340.00    11655.30    12313.00',
                'US     21004.00     5120.00     5480.20     5101.80     5302.00',
                'DE            —           —        0.00       12.50           —',
            ].join('\n'));
        });

        it('prints counts as they are when the unit is not a currency, and leaves out what the server left out', () => {
            const installs: ChartResponse = {
                data: {
                    chart_id: 'installs',
                    segments: [{ is_total: true, key: null, title: 'Total', value: 1200, values: [{ date: '2026-09-01', value: 1200 }] }],
                    title: 'Installs',
                    value: 1200,
                },
                meta: {
                    definitions: {},
                    query: {
                        chart_id: 'installs',
                        filters: { date: ['2026-09-01', '2026-09-30'] },
                        period_unit: 'month',
                        timezone: 'UTC',
                    },
                },
            };

            expect(renderChart(installs)).to.equal([
                'Installs',
                '2026-09-01 – 2026-09-30, month, timezone UTC',
                '',
                '       Total  2026-09-01',
                'Total   1200        1200',
            ].join('\n'));
        });

        it('falls back to the title for a segment the server sent without a key', () => {
            const segment: ChartSegment = { is_total: false, key: null, title: 'Germany', value: 1, values: [] };

            expect(renderChart(withSegments([segment])).split('\n').at(-1)).to.equal('Germany   1.00');
        });

        it('says so when the period has no segments', () => {
            expect(renderChart(withSegments([]))).to.equal([
                'Revenue, gross, USD',
                '2026-09-01 – 2026-09-28, week, timezone Europe/Berlin',
                '',
                'No data for this period.',
            ].join('\n'));
        });
    });

    describe('renderCsv', () => {
        it('prints segment,total,<date>... with raw numbers and an empty field for null', () => {
            expect(renderCsv(revenueByCountry)).to.equal([
                'segment,total,2026-09-01,2026-09-08,2026-09-15,2026-09-22',
                'Total,48210.4,11902.1,12340,11655.3,12313',
                'US,21004,5120,5480.2,5101.8,5302',
                'DE,,,0,12.5,',
            ].join('\n'));
        });

        it('quotes a field with a comma, a quote or a line break, and doubles its quotes (RFC 4180)', () => {
            const segments: ChartSegment[] = ['Plain', 'Korea, Republic of', 'The "Pro" plan', 'two\nlines'].map(title => ({
                is_total: false,
                key: null,
                title,
                value: 1,
                values: [],
            }));

            expect(renderCsv(withSegments(segments))).to.equal([
                'segment,total',
                'Plain,1',
                '"Korea, Republic of",1',
                '"The ""Pro"" plan",1',
                '"two\nlines",1',
            ].join('\n'));
        });

        it('prints the header alone when the period has no segments', () => {
            expect(renderCsv(withSegments([]))).to.equal('segment,total');
        });
    });
});
