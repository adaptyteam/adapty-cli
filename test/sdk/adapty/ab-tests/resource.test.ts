import { expect } from 'chai';

import { createAdapty, stopContent } from '../../../../src/sdk/adapty/index.js';
import { ValidationError } from '../../../../src/sdk/core/errors.js';
import { createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const BASE = 'https://api.example.com/v1';
const APP = 'app-1';
const TEST = 'test-1';
const A = { paywall_id: 'pw-a', weight: 50 };
const B = { paywall_id: 'pw-b', title: 'B', weight: 50 };

const setup = (script: Script = [{ body: {} }]) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

    return { abTests: adapty.abTests, calls: scripted.calls };
};

const sent = (body: string | undefined): unknown => JSON.parse(body ?? 'null');

describe('adapty.abTests', () => {
    it('lists with the names this API uses, and leaves an unset filter out', async () => {
        const { abTests, calls } = setup([{ body: {} }, { body: {} }]);

        await abTests.list(APP, { page: 2, pageSize: 10, placementId: 'pl', search: 'price', state: 'live', type: 'paywall' });
        await abTests.list(APP);

        const query = new URL(calls[0]?.url ?? '').searchParams;

        expect(Object.fromEntries(query)).to.deep.equal({
            'filter[placement_id]': 'pl',
            'filter[search]': 'price',
            'filter[state]': 'live',
            'page[number]': '2',
            'page[size]': '10',
            'type': 'paywall',
        });

        expect(calls[1]?.url).to.equal(`${BASE}/apps/${APP}/ab-tests/`);
    });

    it('reads one test', async () => {
        const { abTests, calls } = setup();

        await abTests.get(APP, TEST);

        expect(calls[0]?.method).to.equal('GET');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/ab-tests/${TEST}/`);
    });

    // The three forms of the planned audience are three different requests
    for (const [name, segmentIds, expected] of [
        ['no audience', undefined, undefined],
        ['All users', [], []],
        ['one segment', ['s1'], ['s1']],
    ] as const) {
        it(`create sends ${name} as ${expected === undefined ? 'no segment_ids' : JSON.stringify(expected)}`, async () => {
            const { abTests, calls } = setup();

            await abTests.create(APP, { goal: '', paywalls: [A, B], segmentIds, title: 'T' });

            expect(calls[0]?.method).to.equal('POST');
            expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/ab-tests/`);

            expect(sent(calls[0]?.body)).to.deep.equal({
                goal: '',
                paywalls: [A, B],
                title: 'T',
                ...(expected === undefined ? {} : { segment_ids: expected }),
            });
        });
    }

    it('update is a PUT of the whole test, flows included', async () => {
        const { abTests, calls } = setup();

        await abTests.update(APP, TEST, { flows: [{ flow_id: 'f1', weight: 100 }], placementId: 'pl', title: 'T' });

        expect(calls[0]?.method).to.equal('PUT');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/ab-tests/${TEST}/`);
        expect(sent(calls[0]?.body)).to.deep.equal({ flows: [{ flow_id: 'f1', weight: 100 }], placement_id: 'pl', title: 'T' });
    });

    it('start names the placement and the audience, both required', async () => {
        const { abTests, calls } = setup();

        await abTests.start(APP, TEST, { placementId: 'pl', segmentIds: [] });

        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/ab-tests/${TEST}/start/`);
        expect(sent(calls[0]?.body)).to.deep.equal({ placement_id: 'pl', segment_ids: [] });
    });

    it('stop sends the content field of the type of the test, and {} for no content', async () => {
        const { abTests, calls } = setup([{ body: {} }, { body: {} }, { body: {} }, { body: {} }, { body: {} }]);

        await abTests.stop(APP, TEST, stopContent('paywall', { id: 'c', kind: 'winner' }));
        await abTests.stop(APP, TEST, stopContent('flow', { id: 'c', kind: 'winner' }));
        await abTests.stop(APP, TEST, stopContent('paywall', { id: 'c', kind: 'other' }));
        await abTests.stop(APP, TEST, stopContent('flow', { id: 'c', kind: 'other' }));
        await abTests.stop(APP, TEST);

        expect(calls.map(call => sent(call.body))).to.deep.equal([
            { winner_paywall_id: 'c' },
            { winner_flow_id: 'c' },
            { another_paywall_id_to_run: 'c' },
            { another_flow_id_to_run: 'c' },
            {},
        ]);

        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/ab-tests/${TEST}/stop/`);
    });

    it('replace takes a placement and no audience', async () => {
        const { abTests, calls } = setup();

        await abTests.replace(APP, TEST, { goal: '', paywalls: [A, B], placementId: 'pl', title: 'T' });

        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/ab-tests/${TEST}/replace/`);
        expect(sent(calls[0]?.body)).to.deep.equal({ goal: '', paywalls: [A, B], placement_id: 'pl', title: 'T' });
    });

    it('archive is a DELETE without a body', async () => {
        const { abTests, calls } = setup();

        await abTests.archive(APP, TEST);

        expect(calls[0]?.method).to.equal('DELETE');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/ab-tests/${TEST}/`);
        expect(calls[0]?.body).to.equal(undefined);
    });

    describe('input that makes no sense is refused before the network', () => {
        const cases: [string, (abTests: ReturnType<typeof setup>['abTests']) => Promise<unknown>][] = [
            ['an empty title', abTests => abTests.create(APP, { paywalls: [A], title: ' ' })],
            ['no arms', abTests => abTests.create(APP, { title: 'T' })],
            ['paywalls and flows together', abTests => abTests.create(APP, { flows: [], paywalls: [A], title: 'T' })],
            ['two segments', abTests => abTests.update(APP, TEST, { paywalls: [A], segmentIds: ['a', 'b'], title: 'T' })],
            ['a replace with no placement', abTests => abTests.replace(APP, TEST, { paywalls: [A], title: 'T' })],
            ['a start on two segments', abTests => abTests.start(APP, TEST, { placementId: 'pl', segmentIds: ['a', 'b'] })],
            ['a stop with two contents', abTests => abTests.stop(APP, TEST, { winnerFlowId: 'a', winnerPaywallId: 'b' })],
        ];

        for (const [name, call] of cases) {
            it(name, async () => {
                const { abTests, calls } = setup([]);

                expect(await rejection(call(abTests))).to.be.instanceOf(ValidationError);
                expect(calls).to.deep.equal([]);
            });
        }
    });
});
