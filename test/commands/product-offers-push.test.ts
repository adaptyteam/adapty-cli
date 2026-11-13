import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import { assertFetch, mockFetch, mockFetchSteps, requestOf, restoreFetch, TEST_APP_ID, TEST_RESOURCE_ID } from '../helpers/mock-fetch.js';

const PUSH = (store: string): string => `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/offers/push/${store}/`;
const PREVIEW_PATH = (store: string): string => `${PUSH(store)}preview/`;
const BASE = `--app ${TEST_APP_ID} --product ${TEST_RESOURCE_ID}`;
const INTRO = `${BASE} --store app_store --title "Free week" --type introductory --mode free_trial --period one_week`;

const OFFER = {
    duration: null,
    id: '770e8400-e29b-41d4-a716-446655440002',
    offer_type: 'introductory',
    product_id: TEST_RESOURCE_ID,
    store_offers: { app_store: { offer_id: 'intro' } },
    title: 'Free week',
};

const PREVIEW = {
    errors: [],
    regions: [
        { currency: 'USD', exists: false, price: '0.00', region_code: 'US', store_price_id: 'p-us', subscription_price: '9.99' },
        { currency: 'EUR', exists: true, price: null, region_code: 'DE', store_price_id: null, subscription_price: '9.49' },
    ],
    store_offer_id: 'intro',
    warnings: ['Germany already has an introductory offer'],
};

const result = (created: number, unfinished: string[] = [], skipped = 1) => ({
    offer: OFFER,
    store_result: {
        created,
        failed: unfinished.length,
        failures: unfinished.map(region => ({ error_code: 'deadline_exceeded', message: 'Not finished in time', region_code: region })),
        skipped,
        store_offer_id: 'intro',
    },
});

const bodyOf = (stub: sinon.SinonStub, callIndex: number): unknown => JSON.parse(requestOf(stub, callIndex).body ?? '');

/** Under --json oclif prints the error as JSON and sets the process exit code instead of throwing. */
const runJson = async (args: string): Promise<{ error: Record<string, unknown>; exit: unknown }> => {
    process.exitCode = undefined;

    const { stdout } = await runCommand(args);
    const exit = process.exitCode;

    process.exitCode = undefined;

    return { error: (JSON.parse(stdout) as { error: Record<string, unknown> }).error, exit };
};

describe('product-offers push', () => {
    let fetchStub: sinon.SinonStub | undefined;
    const dirs: string[] = [];

    const writeJson = (value: unknown): string => {
        const dir = mkdtempSync(join(tmpdir(), 'offer-push-'));
        dirs.push(dir);

        const file = join(dir, 'body.json');
        writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));

        return file;
    };

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        delete process.env.ADAPTY_TOKEN;

        for (const dir of dirs.splice(0)) {
            rmSync(dir, { force: true, recursive: true });
        }
    });

    it('prints a Google Play discount as its share, not as a dash that reads like free', async () => {
        fetchStub = mockFetch([PREVIEW]);

        const { stdout } = await runCommand(
            `product-offers push ${BASE} --store play_store --title Half --type promotional --mode pay_as_you_go --period one_month --store-offer-id half --discount-percent 50 --dry-run`,
        );

        expect(stdout).to.contain('DE           EUR         -50%                9.49     yes');
    });

    it('prints the preview table, the errors and the warnings', async () => {
        fetchStub = mockFetch([PREVIEW]);

        const { stdout } = await runCommand(`product-offers push ${INTRO} --dry-run`);

        expect(stdout.split('\n')).to.deep.equal([
            'Store offer ID: intro',
            'Region  Currency  Offer price  Subscription price  Exists',
            'US           USD         0.00                9.99      no',
            'DE           EUR         free                9.49     yes',
            '',
            'Warnings:',
            'Germany already has an introductory offer',
            'Nothing pushed (--dry-run).',
            '',
        ]);
    });

    it('--dry-run sends the body of the flags to the preview and pushes nothing', async () => {
        fetchStub = mockFetch([PREVIEW]);

        const { error } = await runCommand(`product-offers push ${BASE} --store play_store --title Spring --type promotional --mode pay_as_you_go `
            + '--period one_month --periods 3 --store-offer-id spring-50 --price 4.99 --currency eur --round up --region-price de=3.99 '
            + '--region-price FR=4.49 --regions us,DE --start-date 2026-12-01 --end-date 2026-12-31 --priority high '
            + '--eligibility acquisition --offer-tag spring --offer-tag sale --dry-run');

        expect(error).to.equal(undefined);
        expect(fetchStub.callCount).to.equal(1);
        assertFetch({ callIndex: 0, method: 'POST', path: PREVIEW_PATH('play_store'), stub: fetchStub });

        expect(bodyOf(fetchStub, 0)).to.deep.equal({
            end_date: '2026-12-31',
            google: { eligibility: 'acquisition', offer_tags: ['spring', 'sale'] },
            number_of_periods: 3,
            offer_type: 'promotional',
            payment_mode: 'pay_as_you_go',
            period: 'one_month',
            price: { amount: '4.99', currency: 'EUR', rounding: 'up' },
            priority: 'high',
            region_prices: [{ amount: '3.99', region_code: 'DE' }, { amount: '4.49', region_code: 'FR' }],
            regions: ['US', 'DE'],
            start_date: '2026-12-01',
            store_offer_id: 'spring-50',
            title: 'Spring',
        });
    });

    it('a preview with errors prints them, exits 4 and pushes nothing, also with --yes', async () => {
        const rejected = {
            ...PREVIEW,
            errors: [
                { error_code: 'price_point_missing', message: 'No price point for 0.10', region_code: 'BR' },
                { error_code: 'offer_exists', message: 'The offer id is taken', region_code: null },
            ],
        };

        fetchStub = mockFetch([rejected]);

        const { error, stdout } = await runCommand(`product-offers push ${INTRO} --yes`);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error).to.have.property('code', 'offer_push_rejected');
        expect(error?.message).to.contain('Nothing was pushed, the preview has errors:');
        expect(error?.message).to.contain('BR price_point_missing: No price point for 0.10');
        expect(error?.message).to.contain('all regions offer_exists: The offer id is taken');
        expect(stdout).to.contain('Errors:');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('--json of a preview with errors lists them under the push code', async () => {
        fetchStub = mockFetch([{ ...PREVIEW, errors: [{ error_code: 'price_point_missing', message: 'x', region_code: 'BR' }] }]);

        const { error, exit } = await runJson(`product-offers push ${INTRO} --yes --json`);

        expect(exit).to.equal(exitCode.api);
        expect(error).to.include({ code: 'offer_push_rejected', error_code: 'offer_push_rejected' });
        expect(error.errors).to.have.length(1);
    });

    it('asks first: with no terminal it exits 6 after the preview, says what it writes, and pushes nothing', async () => {
        fetchStub = mockFetch([PREVIEW]);

        const { error } = await runCommand(`product-offers push ${INTRO}`);

        expect(error?.oclif?.exit).to.equal(exitCode.confirmRequired);
        expect(error).to.have.property('code', 'confirm_required');
        expect(error?.message).to.contain('it writes to the REAL store account');
        expect(error?.message).to.contain('It creates the offer in 1 region and skips 1 that already has it.');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('--yes pushes the same body and prints the summary', async () => {
        fetchStub = mockFetch([PREVIEW, result(1)]);

        const { error, stdout } = await runCommand(`product-offers push ${INTRO} --yes`);

        expect(error).to.equal(undefined);
        assertFetch({ callIndex: 1, method: 'POST', path: PUSH('app_store'), stub: fetchStub });
        expect(requestOf(fetchStub, 1).body).to.equal(requestOf(fetchStub, 0).body);
        expect(stdout).to.contain('Store offer intro: created 1, skipped 1, failed 0.');
        expect(stdout).to.contain(`Adapty offer: ${OFFER.id}`);
    });

    it('--json prints the preview and the push answer', async () => {
        fetchStub = mockFetch([PREVIEW, result(1)]);

        const { stdout } = await runCommand(`product-offers push ${INTRO} --yes --json`);

        expect(JSON.parse(stdout)).to.deep.equal({
            attempts: 1,
            offer: OFFER,
            preview: PREVIEW,
            pushed: true,
            reason: null,
            store_result: result(1).store_result,
            timed_out: false,
            totals: { attempts: 1, created: 1, failed: 0, skipped: 1 },
        });
    });

    it('--json of --dry-run says why nothing was pushed', async () => {
        fetchStub = mockFetch([PREVIEW]);

        const { stdout } = await runCommand(`product-offers push ${INTRO} --dry-run --json`);

        expect(JSON.parse(stdout)).to.deep.equal({ preview: PREVIEW, pushed: false, reason: 'dry_run' });
    });

    it('--file sends the body as written, unknown fields too', async () => {
        const body = { future_field: [1], offer_type: 'win_back', payment_mode: 'pay_up_front', period: 'one_month', store_offer_id: 'wb', title: 'Back', win_back: { paid_subscription_months: 3 } };
        fetchStub = mockFetch([PREVIEW, result(1)]);

        const { error } = await runCommand(`product-offers push ${BASE} --store app_store --file ${writeJson(body)} --yes`);

        expect(error).to.equal(undefined);
        expect(bodyOf(fetchStub, 0)).to.deep.equal(body);
        expect(bodyOf(fetchStub, 1)).to.deep.equal(body);
    });

    it('--file with a body flag exits 2 before any request', async () => {
        fetchStub = mockFetch([PREVIEW]);

        const { error } = await runCommand(`product-offers push ${BASE} --store app_store --file ${writeJson({ title: 'x' })} --title Other --dry-run`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--file');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('a --file body the rules refuse names the field under --file', async () => {
        fetchStub = mockFetch([PREVIEW]);

        const { error } = await runCommand(`product-offers push ${BASE} --store app_store --file ${writeJson({ number_of_periods: 20, offer_type: 'introductory', payment_mode: 'free_trial', period: 'one_week', title: 'x' })}`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--file: number_of_periods: must be a whole number from 1 to 12');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('a --file that is not a JSON object exits 2', async () => {
        fetchStub = mockFetch([PREVIEW]);

        const { error } = await runCommand(`product-offers push ${BASE} --store app_store --file ${writeJson('[1]')}`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--file: must hold one JSON object');
        expect(fetchStub.callCount).to.equal(0);
    });

    for (const { args, says } of [
        { args: `${BASE} --store app_store --type introductory --mode free_trial --period one_week`, says: '--title: is required' },
        { args: `${INTRO} --store-offer-id intro`, says: '--store-offer-id: an App Store introductory offer has no offer id' },
        { args: `${INTRO} --region-price DE`, says: 'Expected REGION=AMOUNT' },
        { args: `${INTRO} --eligibility acquisition`, says: 'the Google Play flags' },
        { args: `${INTRO} --no-wait --timeout 30s`, says: '--timeout is the budget of the repeats' },
    ]) {
        it(`exits 2 before any request: ${says}`, async () => {
            fetchStub = mockFetch([PREVIEW]);

            const { error } = await runCommand(`product-offers push ${args} --yes`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain(says);
            expect(fetchStub.callCount).to.equal(0);
        });
    }

    describe('regions the store did not finish in time', () => {
        it('pushes again until none is left and sums what every push created', async () => {
            fetchStub = mockFetch([PREVIEW, result(60, ['FR', 'IT'], 1), result(2, [], 61)]);

            const { error, stderr, stdout } = await runCommand(`product-offers push ${INTRO} --yes`);

            expect(error).to.equal(undefined);
            expect(fetchStub.callCount).to.equal(3);
            expect(requestOf(fetchStub, 2).body).to.equal(requestOf(fetchStub, 1).body);
            expect(stderr).to.contain('Created 60; the store did not finish 2 regions in time — pushing again…');
            expect(stdout).to.contain('Store offer intro: created 62, skipped 1, failed 0 (2 pushes).');
        });

        it('counts a region the store created without answering, which the next push skips', async () => {
            // Seen live: the store created FR and IT, but the push got no answer and left them unfinished
            fetchStub = mockFetch([PREVIEW, result(58, ['FR', 'IT'], 1), result(0, [], 63)]);

            const { error, stdout } = await runCommand(`product-offers push ${INTRO} --yes`);

            expect(error).to.equal(undefined);
            expect(stdout).to.contain('Store offer intro: created 62, skipped 1, failed 0 (2 pushes).');
        });

        it('a timeout exits 4 with offer_push_incomplete and says to run the same command again', async () => {
            // The push takes a moment, as a real one does, so the next one would start past the 1s budget
            fetchStub = sinon.stub(globalThis, 'fetch');
            fetchStub.onCall(0).resolves(Response.json(PREVIEW));

            fetchStub.callsFake(async () => {
                await delay(20);

                return Response.json(result(60, ['FR']));
            });

            const { error, exit } = await runJson(`product-offers push ${INTRO} --yes --timeout 1s --json`);

            expect(exit).to.equal(exitCode.api);
            expect(fetchStub.callCount).to.equal(2);
            expect(error).to.include({ attempts: 1, code: 'offer_push_incomplete', pushed: true, timed_out: true });
            expect(error.message).to.contain('The --timeout budget ran out before the store finished 1 region. Run the same command again');
            expect(error.offer).to.deep.equal(OFFER);
        });

        it('--no-wait pushes once and exits 4 with the regions left', async () => {
            fetchStub = mockFetch([PREVIEW, result(60, ['FR'])]);

            const { error } = await runCommand(`product-offers push ${INTRO} --yes --no-wait`);

            expect(fetchStub.callCount).to.equal(2);
            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error).to.have.property('code', 'offer_push_incomplete');
            expect(error?.message).to.contain('The push ended before the store finished 1 region.');
        });

        it('a region that failed for another reason exits 4 with offer_push_failed and its message', async () => {
            const failed = result(60);
            failed.store_result.failed = 1;
            failed.store_result.failures = [{ error_code: 'price_point_missing', message: 'No price point', region_code: 'BR' }];
            fetchStub = mockFetch([PREVIEW, failed]);

            const { error } = await runCommand(`product-offers push ${INTRO} --yes`);

            expect(fetchStub.callCount).to.equal(2);
            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error).to.have.property('code', 'offer_push_failed');
            expect(error?.message).to.contain('The push failed in 1 region:\nBR price_point_missing: No price point');
        });

        it('a repeat that fails still says the pushes before it went through', async () => {
            fetchStub = sinon.stub(globalThis, 'fetch');
            fetchStub.onCall(0).resolves(Response.json(PREVIEW));
            fetchStub.onCall(1).resolves(Response.json(result(60, ['FR'])));
            fetchStub.rejects(new TypeError('fetch failed'));

            const { error, exit } = await runJson(`product-offers push ${INTRO} --yes --json`);

            expect(exit).to.equal(exitCode.network);
            expect(fetchStub.callCount).to.equal(3);
            expect(error).to.include({ attempts: 1, code: 'network_error', pushed: true });
            expect(error.message).to.match(/^The push created the offer in 60 regions, but the next push failed: Could not reach/);
        });
    });

    it('a refused push keeps the server code and exits 4', async () => {
        fetchStub = mockFetchSteps([
            { body: PREVIEW },
            { body: { error_code: 'offer_push_store_error', errors: [], status_code: 424 }, status: 424 },
        ]);

        const { error } = await runCommand(`product-offers push ${INTRO} --yes`);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error).to.have.property('code', 'offer_push_store_error');
        expect(fetchStub.callCount).to.equal(2);
    });
});
