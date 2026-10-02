import type { ChartResponse } from '../../src/sdk/adapty/index.js';

/** The SPEC's example answer of `POST /apps/<id>/analytics/metrics/`, four weeks by country. */
export const revenueByCountry: ChartResponse = {
    data: {
        chart_id: 'revenue',
        segments: [
            {
                is_total: true,
                key: null,
                title: 'Total',
                value: 48_210.4,
                values: [
                    { date: '2026-09-01', value: 11_902.1 },
                    { date: '2026-09-08', value: 12_340 },
                    { date: '2026-09-15', value: 11_655.3 },
                    { date: '2026-09-22', value: 12_313 },
                ],
            },
            {
                is_total: false,
                key: 'US',
                title: 'United States',
                value: 21_004,
                values: [
                    { date: '2026-09-01', value: 5120 },
                    { date: '2026-09-08', value: 5480.2 },
                    { date: '2026-09-15', value: 5101.8 },
                    { date: '2026-09-22', value: 5302 },
                ],
            },
            {
                is_total: false,
                key: 'DE',
                title: 'Germany',
                value: null,
                values: [
                    { date: '2026-09-01', value: null },
                    { date: '2026-09-08', value: 0 },
                    { date: '2026-09-15', value: 12.5 },
                ],
            },
        ],
        title: 'Revenue',
        unit: 'USD',
        value: 48_210.4,
    },
    meta: {
        definitions: {
            country: 'Profile country: the store country when known, else the IP country.',
            value: 'Store price paid by the user, in USD at the purchase-date exchange rate.',
        },
        query: {
            chart_id: 'revenue',
            filters: { country: ['US', 'DE'], date: ['2026-09-01', '2026-09-28'], store: ['play_store'] },
            period_unit: 'week',
            revenue_basis: 'gross',
            segmentation: 'country',
            timezone: 'Europe/Berlin',
        },
    },
};
