import { expect } from 'chai';

import { createAttribution, DEFAULT_ATTRIBUTION_API_URL } from '../../../src/sdk/attribution/index.js';
import { ApiError, AuthRequiredError, ValidationError } from '../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

import type { ReportInput } from '../../../src/sdk/attribution/index.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://ua.example.com/api/v1/cli';
const APP_ID = '3f1c2a4e-8b7d-4c1e-9a2f-5d6e7f8a9b0c';

const setup = (script: Script, options: { baseUrl?: string | undefined } = { baseUrl: BASE }) => {
    const scripted = createScriptedFetch(script);
    const clock = createFakeClock();

    const attribution = createAttribution({
        baseUrl: options.baseUrl,
        clock,
        fetch: scripted.fetch,
        token: 't',
        userAgent: 'adapty-cli/test',
    });

    return { attribution, calls: scripted.calls, clock };
};

const reportInput: ReportInput = {
    appId: APP_ID,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    granularity: 'day',
    groupBy: ['date', 'campaign'],
    metrics: ['spend', 'd7_roas'],
    revenueBasis: 'gross',
};

const errorBody = (errorCode: string, statusCode: number, message: string, fieldName: null | string = null) => ({
    errors: [{ error_code: errorCode, field_name: fieldName, message, status_code: statusCode }],
});

const metricsBody = {
    data: {
        metrics: [{
            additive: true,
            denominator: null,
            description: 'Ad spend in USD',
            example: null,
            family: 'spend',
            label: 'Spend',
            name: 'spend',
            pattern: null,
            spend_based: true,
            unit: 'usd',
        }],
    },
    meta: null,
    success: true,
};

describe('attribution', () => {
    it('sends a report as a POST without a trailing slash and passes the answer through unchanged', async () => {
        const answer = {
            data: {
                rows: [{ campaign_id: '42', campaign_name: 'Summer', date: '2026-08-01', d7_roas: null, spend: 10.5 }],
                totals: { d7_roas: null, spend: 10.5 },
            },
            meta: { max_valid_day: 45, query: { app_id: APP_ID, currency: 'USD' }, spend_channels: ['facebook'] },
            success: true,
        };

        const { attribution, calls } = setup([{ body: answer }]);

        const result = await attribution.report(reportInput);

        expect(calls).to.have.length(1);
        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/report`);
        expect(calls[0]?.headers.get('authorization')).to.equal('Bearer t');
        expect(calls[0]?.headers.get('user-agent')).to.equal('adapty-cli/test');

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({
            app_id: APP_ID,
            date_from: '2026-08-01',
            date_to: '2026-08-31',
            granularity: 'day',
            group_by: ['date', 'campaign'],
            metrics: ['spend', 'd7_roas'],
            revenue_basis: 'gross',
        });

        // Passed through in the server's snake_case: this object is what --json prints
        expect(result).to.deep.equal(answer);
    });

    it('breaks a report rule before reaching the network', async () => {
        const { attribution, calls } = setup([]);

        const error = await rejection(attribution.report({ ...reportInput, dateFrom: '2026-09-01', metrics: [] }));

        expect(error).to.be.instanceOf(ValidationError);
        expect((error as ValidationError).issues.map(issue => issue.path)).to.deep.equal(['dateTo', 'metrics']);
        expect(calls).to.have.length(0);
    });

    it('sends values as a POST with a snake_case body and passes the answer through unchanged', async () => {
        const answer = {
            data: { dimension: 'campaign', items: [{ channel: 'facebook', id: '42', name: 'Summer' }] },
            meta: { query: { app_id: APP_ID, dimension: 'campaign' } },
            success: true,
        };

        const { attribution, calls } = setup([{ body: answer }]);

        const result = await attribution.values({
            appId: APP_ID,
            dateFrom: '2026-08-01',
            dateTo: '2026-08-31',
            dimension: 'campaign',
        });

        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/values`);

        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({
            app_id: APP_ID,
            date_from: '2026-08-01',
            date_to: '2026-08-31',
            dimension: 'campaign',
        });

        expect(result).to.deep.equal(answer);
    });

    it('breaks a values rule before reaching the network', async () => {
        const { attribution, calls } = setup([]);

        const error = await rejection(attribution.values({
            appId: APP_ID,
            dateFrom: '2026-08-01',
            dateTo: 'yesterday',
            dimension: 'country',
        }));

        expect(error).to.be.instanceOf(ValidationError);
        expect(calls).to.have.length(0);
    });

    it('reads the catalog with GETs that carry no app id', async () => {
        const dimensionsBody = {
            data: {
                dimensions: [{
                    filterable: true,
                    granularities: ['day', 'week'],
                    groupable: true,
                    identity: 'value',
                    label: 'Date',
                    name: 'date',
                }],
            },
            meta: null,
            success: true,
        };

        const { attribution, calls } = setup([{ body: metricsBody }, { body: dimensionsBody }]);

        expect(await attribution.metrics()).to.deep.equal(metricsBody);
        expect(await attribution.dimensions()).to.deep.equal(dimensionsBody);

        expect(calls.map(call => [call.method, call.url])).to.deep.equal([
            ['GET', `${BASE}/metrics`],
            ['GET', `${BASE}/dimensions`],
        ]);

        for (const call of calls) {
            expect(call.body).to.equal(undefined);
            expect([...call.headers.keys()].sort()).to.deep.equal(['accept', 'authorization', 'user-agent']);
        }
    });

    it('talks to the production attribution API unless told otherwise', async () => {
        const { attribution, calls } = setup([{ body: metricsBody }], {});

        await attribution.metrics();

        expect(DEFAULT_ATTRIBUTION_API_URL).to.equal('https://api-ua.adapty.io/api/v1/cli');
        expect(calls[0]?.url).to.equal('https://api-ua.adapty.io/api/v1/cli/metrics');
    });

    it('turns an unknown metric into an ApiError that keeps the code and names the field', async () => {
        const { attribution } = setup([{
            body: errorBody('attribution_unknown_metric', 422, 'Unknown metric: d9000_roas', 'metrics'),
            status: 422,
        }]);

        const error = await rejection(attribution.report(reportInput));

        expect(error).to.be.instanceOf(ApiError);
        expect((error as ApiError).status).to.equal(422);
        expect((error as ApiError).code).to.equal('attribution_unknown_metric');
        expect((error as ApiError).message).to.equal('metrics: Unknown metric: d9000_roas');
    });

    it('turns a company without attribution into an ApiError with the access code', async () => {
        const { attribution } = setup([{
            body: errorBody('attribution_access_required', 402, 'Attribution is not enabled'),
            status: 402,
        }]);

        const error = await rejection(attribution.report(reportInput));

        expect(error).to.be.instanceOf(ApiError);
        expect((error as ApiError).status).to.equal(402);
        expect((error as ApiError).code).to.equal('attribution_access_required');
    });

    it('turns a 401 into AuthRequiredError, whatever the body says', async () => {
        const { attribution } = setup([{
            body: errorBody('attribution_token_invalid', 401, 'Invalid token'),
            status: 401,
        }]);

        const error = await rejection(attribution.metrics());

        expect(error).to.be.instanceOf(AuthRequiredError);
        expect((error as AuthRequiredError).reason).to.equal('rejected');
    });

    it('never re-runs a report: a 503 fails at once and carries the delay the server asked for', async () => {
        const { attribution, calls, clock } = setup([
            { body: errorBody('attribution_query_unavailable', 503, 'Try later'), headers: { 'retry-after': '30' }, status: 503 },
            { body: { data: { rows: [], totals: null }, meta: {}, success: true } },
        ]);

        const error = await rejection(attribution.report(reportInput));

        expect(calls).to.have.length(1);
        expect(clock.sleeps).to.deep.equal([]);
        expect(error).to.be.instanceOf(ApiError);
        expect((error as ApiError).code).to.equal('attribution_query_unavailable');
        expect((error as ApiError).retryAfterMs).to.equal(30_000);
    });

    it('never re-runs a values query either: a 429 fails at once', async () => {
        const { attribution, calls } = setup([
            { body: errorBody('attribution_busy', 429, 'Busy'), headers: { 'retry-after': '5' }, status: 429 },
            { body: { data: { dimension: 'country', items: [] }, meta: {}, success: true } },
        ]);

        const error = await rejection(attribution.values({
            appId: APP_ID,
            dateFrom: '2026-08-01',
            dateTo: '2026-08-31',
            dimension: 'country',
        }));

        expect(calls).to.have.length(1);
        expect((error as ApiError).code).to.equal('attribution_busy');
        expect((error as ApiError).retryAfterMs).to.equal(5000);
    });

    it('retries a catalog read that met a 503, after the delay the server asked for', async () => {
        const { attribution, calls, clock } = setup([
            { body: errorBody('attribution_upstream_unavailable', 503, 'Down'), headers: { 'retry-after': '2' }, status: 503 },
            { body: metricsBody },
        ]);

        const result = await attribution.metrics();

        expect(calls).to.have.length(2);
        expect(clock.sleeps).to.deep.equal([2000]);
        expect(result).to.deep.equal(metricsBody);
    });
});
