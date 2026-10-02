import { expect } from 'chai';

import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { ApiError, ValidationError } from '../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { revenueByCountry } from '../../fixtures/analytics-chart.js';
import { rejection } from '../../helpers/rejection.js';

import type { ChartInput } from '../../../src/sdk/adapty/index.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/api/v1/developer';
const APP_ID = '3f1c2a4e-8b7d-4c1e-9a2f-5d6e7f8a9b0c';

const setup = (script: Script) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

    return { analytics: adapty.analytics, calls: scripted.calls };
};

const input: ChartInput = { appId: APP_ID, chartId: 'revenue', dateFrom: '2026-09-01', dateTo: '2026-09-28' };

const busy = {
    body: { error_code: 'throttled', errors: { non_field_errors: ['Request was throttled.'] } },
    headers: { 'retry-after': '1' },
    status: 429,
};

describe('adapty.analytics', () => {
    it('sends a chart as a POST to the app route, the period as the date filter, and passes the answer through', async () => {
        const { analytics, calls } = setup([{ body: revenueByCountry }]);

        const chart = await analytics.chart({
            ...input,
            filters: [{ dimension: 'store', values: ['play_store'] }, { dimension: 'country', values: ['US', 'DE'] }],
            periodUnit: 'week',
            revenueBasis: 'gross',
            segmentation: 'country',
        });

        expect(chart).to.deep.equal(revenueByCountry);
        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP_ID}/analytics/metrics/`);

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({
            chart_id: 'revenue',
            filters: { country: ['US', 'DE'], date: ['2026-09-01', '2026-09-28'], store: ['play_store'] },
            period_unit: 'week',
            revenue_basis: 'gross',
            segmentation: 'country',
        });
    });

    it('leaves the optional fields out of the body, so the server defaults apply', async () => {
        const { analytics, calls } = setup([{ body: revenueByCountry }]);

        await analytics.chart(input);

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({
            chart_id: 'revenue',
            filters: { date: ['2026-09-01', '2026-09-28'] },
        });
    });

    it('never retries a chart: a 429 is one request and an ApiError carrying the wait', async () => {
        const { analytics, calls } = setup([busy, { body: revenueByCountry }]);

        const error = await rejection(analytics.chart(input));

        expect(error).to.be.instanceOf(ApiError);
        expect((error as ApiError).status).to.equal(429);
        expect((error as ApiError).retryAfterMs).to.equal(1000);
        expect(calls).to.have.length(1);
    });

    it('breaks the chart rules before reaching the network, all of them at once', async () => {
        const { analytics, calls } = setup([]);

        const error = await rejection(analytics.chart({
            ...input,
            chartId: ' ',
            dateFrom: '2026-09-30',
            filters: [
                { dimension: 'date', values: ['2026-09-01'] },
                { dimension: 'country', values: ['US'] },
                { dimension: 'country', values: ['DE'] },
            ],
        }));

        expect(error).to.be.instanceOf(ValidationError);
        expect((error as ValidationError).issues.map(issue => issue.path)).to.deep.equal(['dateTo', 'chartId', 'filter', 'filter']);
        expect(calls).to.have.length(0);
    });

    it('reads the catalog and the values with GETs, the dimension in the query', async () => {
        const catalog = { data: { charts: [], dimensions: [], period_units: ['day'], revenue_bases: ['gross'] } };
        const values = { data: [{ group: 'Europe', label: 'Germany', value: 'DE' }] };
        const { analytics, calls } = setup([{ body: catalog }, { body: values }]);

        expect(await analytics.catalog(APP_ID)).to.deep.equal(catalog);
        expect(await analytics.values(APP_ID, 'country')).to.deep.equal(values);

        expect(calls.map(call => `${call.method} ${call.url}`)).to.deep.equal([
            `GET ${BASE}/apps/${APP_ID}/analytics/catalog/`,
            `GET ${BASE}/apps/${APP_ID}/analytics/values/?dimension=country`,
        ]);
    });

    it('retries the catalog read on a 429, as every GET of the developer API', async () => {
        const catalog = { data: { charts: [], dimensions: [], period_units: [], revenue_bases: [] } };
        const { analytics, calls } = setup([busy, { body: catalog }]);

        expect(await analytics.catalog(APP_ID)).to.deep.equal(catalog);
        expect(calls).to.have.length(2);
    });

    it('refuses an empty dimension before reaching the network', async () => {
        const { analytics, calls } = setup([]);

        const error = await rejection(analytics.values(APP_ID, ''));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });
});
