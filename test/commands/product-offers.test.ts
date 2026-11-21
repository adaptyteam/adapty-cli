import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    EMPTY_LIST_RESPONSE,
    mockFetch,
    mockFetchFailure,
    mockFetchSteps,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

import type { FetchStep } from '../helpers/mock-fetch.js';
import type * as sinon from 'sinon';

const PRODUCT_ID = '770e8400-e29b-41d4-a716-446655440002';
const OFFER_ID = TEST_RESOURCE_ID;
const OFFER_PATH = `/apps/${TEST_APP_ID}/offers/${OFFER_ID}/`;

const OFFER = {
    duration: null,
    id: OFFER_ID,
    offer_type: 'promotional',
    product_id: PRODUCT_ID,
    store_offers: { app_store: { offer_id: 'spring_ios' }, play_store: { offer_id: 'spring-android' } },
    title: 'Spring',
};

const sentBody = (stub: sinon.SinonStub, callIndex: number): Record<string, unknown> =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- sinon types call args as any
    JSON.parse(stub.getCall(callIndex).args[1].body as string);

const BASE_FLAGS = `${OFFER_ID} --app ${TEST_APP_ID}`;

describe('product-offers', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET under the product and prints the store ids', async () => {
        fetchStub = mockFetch([{ ...EMPTY_LIST_RESPONSE, data: [OFFER] }]);

        const { stdout } = await runCommand(`product-offers list --app ${TEST_APP_ID} --product ${PRODUCT_ID}`);

        assertFetch({
            callIndex: 0,
            method: 'GET',
            path: `/apps/${TEST_APP_ID}/products/${PRODUCT_ID}/offers/`,
            stub: fetchStub,
        });

        expect(stdout).to.contain('spring_ios');
        expect(stdout).to.contain('spring-android');
    });

    it('list takes no --page flag', async () => {
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);

        const { error } = await runCommand(`product-offers list --app ${TEST_APP_ID} --product ${PRODUCT_ID} --page 2`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('get --json prints the offer as the server sent it', async () => {
        fetchStub = mockFetch([OFFER]);

        const { stdout } = await runCommand(`product-offers get ${BASE_FLAGS} --json`);

        expect(JSON.parse(stdout)).to.deep.equal(OFFER);
    });

    it('get calls GET /apps/{app}/offers/{id}', async () => {
        fetchStub = mockFetch([OFFER]);
        const { stdout } = await runCommand(`product-offers get ${BASE_FLAGS}`);

        assertFetch({ callIndex: 0, method: 'GET', path: OFFER_PATH, stub: fetchStub });
        expect(stdout).to.contain('Title: Spring');
        expect(stdout).to.contain('spring_ios');
    });

    it('create calls POST with the server type value `win_back`', async () => {
        fetchStub = mockFetch([OFFER]);

        await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title Back --type win_back --ios-offer-id spring_ios`);

        assertFetch({ callIndex: 0, method: 'POST', path: `/apps/${TEST_APP_ID}/products/${PRODUCT_ID}/offers/`, stub: fetchStub });
        expect(sentBody(fetchStub, 0)).to.deep.equal({ ios_offer_id: 'spring_ios', offer_type: 'win_back', title: 'Back' });
    });

    it('create without a store id exits 2 and sends nothing', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title Spring --type win_back`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('create refuses a win-back on Google Play with exit 2 and sends nothing', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title B --type win_back --android-offer-id x`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--android-offer-id: a win_back offer takes only an App Store offer id');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('update to win_back that keeps the stored Google Play side exits 2 after the GET', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --type win_back`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('clear the stored Google Play one');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('list of a product the app does not have reports the server code under --json', async () => {
        fetchStub = mockFetchFailure({ error_code: 'adapty_product_does_not_exist', errors: [], status_code: 404 }, { status: 404 });

        const { stdout } = await runCommand(`product-offers list --app ${TEST_APP_ID} --product ${PRODUCT_ID} --json`);

        expect((JSON.parse(stdout) as { error: { code: string; status: number } }).error).to.include({ code: 'adapty_product_does_not_exist', status: 404 });
    });

    it('update refuses an introductory offer after the read and sends no PUT', async () => {
        fetchStub = mockFetch([{ ...OFFER, offer_type: 'introductory' }]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --type promotional`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('introductory offers are read-only');
        expect(fetchStub.callCount).to.equal(1);
    });

    it('update reads the offer, then PUTs it with the title changed and both ids kept', async () => {
        fetchStub = mockFetch([OFFER, { ...OFFER, title: 'Spring 2' }]);

        await runCommand(`product-offers update ${BASE_FLAGS} --title "Spring 2"`);

        assertFetch({ callIndex: 0, method: 'GET', path: OFFER_PATH, stub: fetchStub });

        assertFetch({
            body: { android_offer_id: 'spring-android', ios_offer_id: 'spring_ios', offer_type: 'promotional', title: 'Spring 2' },
            callIndex: 1,
            method: 'PUT',
            path: OFFER_PATH,
            stub: fetchStub,
        });
    });

    it('update to win_back with the Google Play side cleared PUTs only the App Store id', async () => {
        fetchStub = mockFetch([OFFER, { ...OFFER, offer_type: 'win_back' }]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --type win_back --clear-android-offer-id`);

        expect(error).to.equal(undefined);

        assertFetch({ callIndex: 1, method: 'PUT', path: OFFER_PATH, stub: fetchStub });
        expect(sentBody(fetchStub, 1)).to.deep.equal({ ios_offer_id: 'spring_ios', offer_type: 'win_back', title: 'Spring' });
    });

    it('update that would clear the last store side exits 2 after the GET and sends no PUT', async () => {
        fetchStub = mockFetch([{ ...OFFER, store_offers: { app_store: { offer_id: 'spring_ios' } } }]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --clear-ios-offer-id`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(1);
        assertFetch({ callIndex: 0, method: 'GET', path: OFFER_PATH, stub: fetchStub });
    });

    for (const store of ['ios', 'android']) {
        it(`update refuses --${store}-offer-id together with --clear-${store}-offer-id`, async () => {
            fetchStub = mockFetch([OFFER]);

            const { error } = await runCommand(`product-offers update ${BASE_FLAGS} --${store}-offer-id a --clear-${store}-offer-id`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(fetchStub.callCount).to.equal(0);
        });
    }

    it('create --json prints the created offer as the server sent it', async () => {
        fetchStub = mockFetch([OFFER]);

        const { stdout } = await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title Spring --type promotional --ios-offer-id spring_ios --json`);

        expect(JSON.parse(stdout)).to.deep.equal(OFFER);
    });

    it('update --json prints the offer the PUT returned', async () => {
        const updated = { ...OFFER, title: 'Spring 2' };
        fetchStub = mockFetch([OFFER, updated]);

        const { stdout } = await runCommand(`product-offers update ${BASE_FLAGS} --title "Spring 2" --json`);

        expect(JSON.parse(stdout)).to.deep.equal(updated);
    });

    it('rejects an offer id that is not a UUID before any request', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers get nope --app ${TEST_APP_ID}`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('Invalid offer ID format.');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('rejects a product id that is not a UUID before any request', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers list --app ${TEST_APP_ID} --product nope`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('Invalid product ID format.');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('create without a store id names both store flags', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title Spring --type promotional`);

        expect(error?.message).to.contain('pass --ios-offer-id, --android-offer-id or both');
    });

    it('update with no field flags exits 2 before the read', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`product-offers update ${BASE_FLAGS}`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    it('reports invalid input before a missing token', async () => {
        delete process.env.ADAPTY_TOKEN;
        fetchStub = mockFetch([OFFER]);

        const create = await runCommand(`product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title Spring --type promotional`);
        const update = await runCommand(`product-offers update ${BASE_FLAGS}`);

        expect(create.error?.oclif?.exit).to.equal(exitCode.usage);
        expect(update.error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    const CREATE = `product-offers create --app ${TEST_APP_ID} --product ${PRODUCT_ID} --title Spring --type promotional --ios-offer-id spring_ios`;
    const UPDATE = `product-offers update ${BASE_FLAGS}`;

    const planned = (plan: 'monthly' | null) =>
        ({ ...OFFER, store_offers: { ...OFFER.store_offers, app_store: { billing_plan_type: plan, offer_id: 'spring_ios' } } });

    // external: the plan key that a write sends, and exit 4 with the saved offer id when the plan did not come back
    // (UC-21 ... UC-23, UC-34)
    const planRows: {
        command: string;
        expectCode?: string;
        expectExit?: number;
        expectPlan: 'absent' | 'monthly' | null;
        id: string;
        steps: FetchStep[];
    }[] = [
        { command: `${CREATE} --billing-plan monthly`, expectPlan: 'monthly', id: 'create-monthly', steps: [{ body: planned('monthly'), status: 201 }] },
        { command: `${UPDATE} --billing-plan upfront`, expectPlan: null, id: 'update-upfront', steps: [{ body: planned('monthly') }, { body: planned(null) }] },
        {
            command: `${CREATE} --billing-plan monthly`,
            expectCode: 'billing_plan_not_applied',
            expectExit: exitCode.api,
            expectPlan: 'monthly',
            id: 'create-old-server-drops-plan',
            steps: [{ body: OFFER, status: 201 }],
        },
        {
            command: `${UPDATE} --billing-plan monthly`,
            expectCode: 'billing_plan_not_applied',
            expectExit: exitCode.api,
            expectPlan: 'monthly',
            id: 'update-old-server-drops-plan',
            steps: [{ body: OFFER }, { body: OFFER }],
        },
    ];

    for (const row of planRows) {
        it(`billing plan: ${row.id}`, async () => {
            fetchStub = mockFetchSteps(row.steps);

            const { error } = await runCommand(row.command);
            const sent = sentBody(fetchStub, fetchStub.callCount - 1);

            expect('billing_plan_type' in sent ? sent.billing_plan_type : 'absent', `${row.id}: plan sent`).to.equal(row.expectPlan);
            expect(error?.oclif?.exit, `${row.id}: exit`).to.equal(row.expectExit);
            expect(error?.code, `${row.id}: code`).to.equal(row.expectCode);

            if (row.expectCode !== undefined) {
                expect(error?.message, row.id).to.contain(`Offer ${OFFER_ID} was saved, but its billing plan was not`);
            }
        });
    }

    it('a dropped plan --json says saved with the offer id, and the write is not repeated', async () => {
        fetchStub = mockFetchSteps([{ body: OFFER, status: 201 }]);
        process.exitCode = undefined;

        const { stdout } = await runCommand(`${CREATE} --billing-plan monthly --json`);
        const exit = process.exitCode;

        process.exitCode = undefined;

        expect(exit).to.equal(exitCode.api);
        expect(JSON.parse(stdout)).to.deep.include({ error: { code: 'billing_plan_not_applied', message: `Offer ${OFFER_ID} was saved, but its billing plan was not: this server does not support the App Store monthly plan yet. Do not create the offer again.`, offer_id: OFFER_ID, saved: true } });
        expect(fetchStub.callCount).to.equal(1);
    });

    it('an unknown --billing-plan word exits 2 and sends nothing', async () => {
        fetchStub = mockFetch([OFFER]);

        const { error } = await runCommand(`${CREATE} --billing-plan yearly`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(fetchStub.callCount).to.equal(0);
    });

    // external: a lost answer is never repeated and says where to look (UC-31a)
    const lostRows = [
        { command: `${CREATE} --billing-plan monthly`, hint: `adapty product-offers list --app ${TEST_APP_ID} --product ${PRODUCT_ID}`, id: 'create', methods: ['POST'], steps: [{ body: {}, status: 502 }] },
        { command: `${UPDATE} --billing-plan monthly`, hint: `adapty product-offers get ${OFFER_ID} --app ${TEST_APP_ID}`, id: 'update', methods: ['GET', 'PUT'], steps: [{ body: OFFER }, { body: {}, status: 502 }] },
    ];

    for (const row of lostRows) {
        it(`a lost answer of ${row.id} says the result is unknown and sends the write once`, async () => {
            fetchStub = mockFetchSteps(row.steps);

            const { error } = await runCommand(row.command);
            const methods = fetchStub.getCalls().map(call => (call.args[1] as { method: string }).method);

            expect(methods, row.id).to.deep.equal(row.methods);
            expect(error?.message, row.id).to.contain('The result is unknown');
            expect(error?.message, row.id).to.contain(row.hint);
        });
    }

    // external: the plan label of the human view; a Play Store side and an old server get none (UC-18, UC-19, UC-32)
    const labelRows = [
        { expected: 'Plan: Monthly', id: 'monthly', offer: planned('monthly') },
        { expected: 'Plan: Upfront', id: 'upfront', offer: planned(null) },
        { expected: undefined, id: 'old-server', offer: OFFER },
        { expected: undefined, id: 'play-store-only', offer: { ...OFFER, store_offers: { play_store: { offer_id: 'spring-android' } } } },
    ];

    for (const row of labelRows) {
        it(`get and list label the ${row.id} App Store plan`, async () => {
            fetchStub = mockFetch([row.offer, { ...EMPTY_LIST_RESPONSE, data: [row.offer] }, row.offer]);

            const get = await runCommand(`product-offers get ${BASE_FLAGS}`);
            const list = await runCommand(`product-offers list --app ${TEST_APP_ID} --product ${PRODUCT_ID}`);
            const json = await runCommand(`product-offers get ${BASE_FLAGS} --json`);

            for (const stdout of [get.stdout, list.stdout]) {
                if (row.expected === undefined) {
                    expect(stdout, row.id).not.to.contain('Plan:');
                } else {
                    expect(stdout, row.id).to.contain(row.expected);
                }

                expect(stdout, row.id).not.to.contain('Billing Plan Type');
            }

            expect(JSON.parse(json.stdout), row.id).to.deep.equal(row.offer);
        });
    }
});
