import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { mockFetchSteps, requestOf, restoreFetch, TEST_APP_ID, TEST_RESOURCE_ID } from '../helpers/mock-fetch.js';

import type { FetchStep } from '../helpers/mock-fetch.js';
import type * as sinon from 'sinon';

const PRODUCT_PATH = `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/`;
const PLAN_PATH = `${PRODUCT_PATH}app-store-monthly-plan/`;
const CONSTANTS_PATH = `/apps/${TEST_APP_ID}/constants/`;
const PLAN = { price_usd: 5.99, vendor_product_id: 'vp-monthly' };

const product = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    access_level_id: 'al',
    app_store_monthly_plan: null,
    id: TEST_RESOURCE_ID,
    offers_count: 0,
    period: 'annual',
    price_usd: 59.99,
    title: 'Yearly',
    vendor_products: { app_store: { base_plan_id: null, id: 'v1', product_id: 'com.example.yearly', store_status: 'approved' } },
    ...overrides,
});

const withoutPlanKey = (): Record<string, unknown> => {
    const { app_store_monthly_plan: _plan, ...rest } = product();

    return rest;
};

const calls = (stub: sinon.SinonStub): string[] =>
    Array.from({ length: stub.callCount }, (_, index) => {
        const { method, url } = requestOf(stub, index);

        return `${method} ${new URL(url).pathname.replace('/api/v1/developer', '')}`;
    });

const SET = `products monthly-plan set ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`;
const PRICES = `products monthly-plan prices ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`;

/** Runs a --json command and reads the exit code it set, as oclif leaves it on the process. */
const runJson = async (command: string) => {
    process.exitCode = undefined;

    const result = await runCommand(command);
    const exit = process.exitCode;

    process.exitCode = undefined;

    return { ...result, exit };
};

describe('products monthly-plan', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    // external: the requests that set sends, the confirmation an agent reads and the exit codes
    const setRows: {
        args: string;
        expectCalls: string[];
        expectExit?: number;
        expectCode?: string;
        expectText: string[];
        id: string;
        steps: FetchStep[];
    }[] = [
        {
            args: '--price-usd 5.99 --yes',
            expectCalls: [`GET ${PRODUCT_PATH}`, `PUT ${PLAN_PATH}`],
            expectText: ['Monthly plan: $5.99 a month (vendor product vp-monthly)'],
            id: 'create-with-yes',
            steps: [{ body: product() }, { body: PLAN }],
        },
        {
            args: '--price-usd 5.99',
            expectCalls: [`GET ${PRODUCT_PATH}`],
            expectCode: 'confirm_required',
            expectExit: exitCode.confirmRequired,
            expectText: ['cannot be removed from Adapty', 'App Store Connect', 'only after the user says yes', '--yes'],
            id: 'create-without-yes-and-terminal',
            steps: [{ body: product() }],
        },
        {
            args: '--price-usd 6.49',
            expectCalls: [`GET ${PRODUCT_PATH}`, `PUT ${PLAN_PATH}`],
            expectText: ['Monthly plan: $6.49 a month'],
            id: 'reprice-asks-nothing',
            steps: [{ body: product({ app_store_monthly_plan: PLAN }) }, { body: { ...PLAN, price_usd: 6.49 } }],
        },
        {
            args: '--price-usd 4.00 --yes',
            expectCalls: [`GET ${PRODUCT_PATH}`, `PUT ${PLAN_PATH}`],
            expectCode: 'monthly_plan_price_out_of_range',
            expectExit: exitCode.api,
            expectText: ['from $5.00 to $7.49 a month'],
            id: 'server-refusal',
            steps: [{ body: product() }, {
                body: {
                    error_code: 'monthly_plan_price_out_of_range',
                    errors: { price_usd: ['12 monthly payments must add up to at least the annual price and at most 1.5 times it: from $5.00 to $7.49 a month.'] },
                    status_code: 400,
                },
                status: 400,
            }],
        },
        {
            args: '--price-usd 5.99 --yes',
            expectCalls: [`GET ${PRODUCT_PATH}`],
            expectCode: 'monthly_plan_not_supported',
            expectExit: exitCode.api,
            expectText: ['does not support the App Store monthly plan yet'],
            id: 'old-server-product-without-key',
            steps: [{ body: withoutPlanKey() }],
        },
        {
            args: '--price-usd 5.99 --yes',
            expectCalls: [`GET ${PRODUCT_PATH}`, `PUT ${PLAN_PATH}`],
            expectCode: 'monthly_plan_not_supported',
            expectExit: exitCode.api,
            expectText: ['does not support the App Store monthly plan yet'],
            id: 'old-server-route-404',
            steps: [{ body: product() }, { body: { detail: 'Not found.' }, status: 404 }],
        },
        {
            args: '--price-usd 5.99 --yes',
            expectCalls: [`GET ${PRODUCT_PATH}`, `PUT ${PLAN_PATH}`, `GET ${PRODUCT_PATH}`],
            expectExit: exitCode.api,
            expectText: ['The result is unknown', 'A read of the product after it shows: Monthly plan: $5.99 a month.'],
            id: 'lost-answer-reads-back-once',
            steps: [
                { body: product() },
                { body: {}, status: 503 },
                { body: product({ app_store_monthly_plan: PLAN }) },
            ],
        },
    ];

    for (const row of setRows) {
        it(`set: ${row.id}`, async () => {
            fetchStub = mockFetchSteps(row.steps);

            const { error, stdout } = await runCommand(`${SET} ${row.args}`);
            const output = `${stdout}${error?.message ?? ''}`;

            expect(calls(fetchStub), `${row.id}: requests`).to.deep.equal(row.expectCalls);
            expect(error?.oclif?.exit, `${row.id}: exit`).to.equal(row.expectExit);
            expect(error?.code, `${row.id}: code`).to.equal(row.expectCode);

            for (const text of row.expectText) {
                expect(output, `${row.id}: output`).to.contain(text);
            }
        });
    }

    it('set --price-usd PUTs the monthly price as a number and --json prints the saved plan', async () => {
        fetchStub = mockFetchSteps([{ body: product() }, { body: PLAN }]);

        const { stdout } = await runCommand(`${SET} --price-usd 5.99 --yes --json`);

        expect(JSON.parse(requestOf(fetchStub, 1).body ?? '')).to.deep.equal({ price_usd: 5.99 });
        expect(JSON.parse(stdout)).to.deep.equal(PLAN);
    });

    it('set --json without --yes exits 6 with confirm_required and sends no write', async () => {
        fetchStub = mockFetchSteps([{ body: product() }]);

        const { exit, stdout } = await runJson(`${SET} --price-usd 5.99 --json`);
        const { error } = JSON.parse(stdout) as { error: { code: string; message: string } };

        expect(exit).to.equal(exitCode.confirmRequired);
        expect(error.code).to.equal('confirm_required');
        expect(error.message).to.contain('only after the user says yes');
        expect(calls(fetchStub)).to.deep.equal([`GET ${PRODUCT_PATH}`]);
    });

    // external: a missing or non-numeric price is a usage error before any request
    for (const { args, id } of [{ args: '', id: 'missing' }, { args: '--price-usd abc', id: 'not-a-number' }]) {
        it(`set: a ${id} price exits 2 and sends nothing`, async () => {
            fetchStub = mockFetchSteps([{ body: product() }]);

            const { error } = await runCommand(`${SET} ${args} --yes`);

            expect(error?.oclif?.exit, id).to.equal(exitCode.usage);
            expect(fetchStub.callCount, id).to.equal(0);
        });
    }

    const PRICE_LIST = { product_prices: [0.29, 4.99, 5.00, 5.49, 5.99, 7.49, 7.50, 7.99, 1000.0] };

    it('prices reads the product and the price list and prints the points that fit', async () => {
        fetchStub = mockFetchSteps([{ body: product() }, { body: PRICE_LIST }]);

        const { stdout } = await runCommand(PRICES);

        expect(calls(fetchStub)).to.deep.equal([`GET ${PRODUCT_PATH}`, `GET ${CONSTANTS_PATH}`]);

        expect(stdout.trim().split('\n')).to.deep.equal([
            'Annual price: $59.99',
            'Monthly prices that fit (12 payments add up to 1x to 1.5x the annual price):',
            '5.00',
            '5.49',
            '5.99',
            '7.49',
        ]);
    });

    it('prices --json prints the annual price and the fitting prices', async () => {
        fetchStub = mockFetchSteps([{ body: product() }, { body: PRICE_LIST }]);

        const { stdout } = await runCommand(`${PRICES} --json`);

        expect(JSON.parse(stdout)).to.deep.equal({ annual_price_usd: 59.99, prices: [5, 5.49, 5.99, 7.49] });
    });

    // external: a product that cannot have a plan exits 4 with the code of a refused write;
    // an old server says so
    const refusedPrices: { code: string; field?: string; id: string; steps: FetchStep[] }[] = [
        { code: 'monthly_plan_requires_annual_product', field: 'product_set', id: 'monthly-product', steps: [{ body: product({ period: 'monthly' }) }, { body: PRICE_LIST }] },
        { code: 'monthly_plan_requires_product_price', field: 'price_usd', id: 'no-annual-price', steps: [{ body: product({ price_usd: 0 }) }, { body: PRICE_LIST }] },
        { code: 'monthly_plan_has_no_price_points', field: 'price_usd', id: 'no-fitting-point', steps: [{ body: product({ price_usd: 0.99 }) }, { body: PRICE_LIST }] },
        { code: 'monthly_plan_requires_app_store_product', field: 'non_field_errors', id: 'no-app-store-product', steps: [{ body: product({ vendor_products: {} }) }, { body: PRICE_LIST }] },
        { code: 'monthly_plan_not_supported', id: 'old-server', steps: [{ body: withoutPlanKey() }, { body: { detail: 'Not found.' }, status: 404 }] },
    ];

    for (const row of refusedPrices) {
        it(`prices: ${row.id} exits 4 with ${row.code}`, async () => {
            fetchStub = mockFetchSteps(row.steps);

            const { exit, stdout } = await runJson(`${PRICES} --json`);
            const { error } = JSON.parse(stdout) as { error: { code: string; errors?: Record<string, string[]> } };

            expect(exit, row.id).to.equal(exitCode.api);
            expect(error.code, row.id).to.equal(row.code);

            if (row.field !== undefined) {
                expect(Object.keys(error.errors ?? {}), row.id).to.deep.equal([row.field]);
            }
        });
    }
});
