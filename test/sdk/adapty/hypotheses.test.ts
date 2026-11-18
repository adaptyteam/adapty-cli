import { expect } from 'chai';

import { toAcceptRequest } from '../../../src/sdk/adapty/hypotheses/accept.js';
import { toBatchRequest, withHypothesisIds } from '../../../src/sdk/adapty/hypotheses/create.js';
import { listQuery, validateList } from '../../../src/sdk/adapty/hypotheses/list.js';
import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

const BASE = 'https://api.example.com/v1';
const APP = 'app';
const HYPOTHESIS = '660e8400-e29b-41d4-a716-446655440001';

const sdk = (script: Parameters<typeof createScriptedFetch>[0]) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

    return { adapty, calls: scripted.calls };
};

describe('hypotheses rules', () => {
    it('listQuery joins every filter with commas and leaves out an unset or empty one', () => {
        expect(listQuery({
            flowIds: ['f1', 'f2'],
            orderBy: '-created_at',
            page: 2,
            pageSize: 50,
            phases: ['testing'],
            placementIds: [],
            states: ['proposed', 'accepted'],
            types: ['adapty:flow_design'],
        })).to.deep.equal({
            'filter[flow_id]': 'f1,f2',
            'filter[parent_hypothesis_id]': undefined,
            'filter[phase]': 'testing',
            'filter[placement_id]': undefined,
            'filter[segment_id]': undefined,
            'filter[state]': 'proposed,accepted',
            'filter[type]': 'adapty:flow_design',
            'filter[variant_flow_id]': undefined,
            'order_by': '-created_at',
            'page[number]': 2,
            'page[size]': 50,
        });
    });

    it('validateList refuses a filter value that is empty or holds a comma', () => {
        expect(validateList(undefined)).to.deep.equal([]);
        expect(validateList({ states: ['proposed'], types: ['adapty:trial'] })).to.deep.equal([]);

        expect(validateList({ flowIds: [''], types: ['a:b,c:d'] })).to.deep.equal([
            { message: '"" must be one value, without a comma', path: 'flowIds' },
            { message: '"a:b,c:d" must be one value, without a comma', path: 'types' },
        ]);
    });

    it('withHypothesisIds mints an id only for the items without one, first in the body', () => {
        const ids = ['m1', 'm2'];
        const { hypotheses, minted } = withHypothesisIds([{ title: 'a' }, { hypothesis_id: 'own', title: 'b' }, { title: 'c' }], () => ids.shift() ?? '');

        expect(minted).to.deep.equal(['m1', 'm2']);

        expect(hypotheses).to.deep.equal([
            { hypothesis_id: 'm1', title: 'a' },
            { hypothesis_id: 'own', title: 'b' },
            { hypothesis_id: 'm2', title: 'c' },
        ]);

        expect(Object.keys(hypotheses[0] ?? {})[0]).to.equal('hypothesis_id');
    });

    it('withHypothesisIds also mints for a null or empty id', () => {
        const { hypotheses, minted } = withHypothesisIds([{ hypothesis_id: null }, { hypothesis_id: '' }], () => 'm');

        expect(minted).to.have.length(2);
        expect(hypotheses).to.deep.equal([{ hypothesis_id: 'm' }, { hypothesis_id: 'm' }]);
    });

    it('toBatchRequest sets force on every item only when asked, and keeps an item\'s own otherwise', () => {
        expect(toBatchRequest({ force: true, hypotheses: [{ hypothesis_id: 'a' }, { force: false, hypothesis_id: 'b' }] }))
            .to.deep.equal({ hypotheses: [{ force: true, hypothesis_id: 'a' }, { force: true, hypothesis_id: 'b' }] });

        expect(toBatchRequest({ hypotheses: [{ force: true, hypothesis_id: 'a' }] }))
            .to.deep.equal({ hypotheses: [{ force: true, hypothesis_id: 'a' }] });
    });

    it('toAcceptRequest is {} with nothing given, and nests the variant and the product fills', () => {
        expect(toAcceptRequest({})).to.deep.equal({});
        expect(toAcceptRequest({ products: [] })).to.deep.equal({});

        expect(toAcceptRequest({
            placementAudienceId: 'pa',
            products: [{ hypothesisProductId: 'hp', productId: 'p' }],
            variantFlowId: 'vf',
        })).to.deep.equal({
            products: [{ hypothesis_product_id: 'hp', product_id: 'p' }],
            variant: { placement_audience_id: 'pa', variant_flow_id: 'vf' },
        });
    });
});

describe('hypotheses resource', () => {
    const stored = { body: { data: [{ data: {}, hypothesis_id: HYPOTHESIS, status: 201 }] } };

    it('create always posts to the batch route', async () => {
        const { adapty, calls } = sdk([stored]);

        await adapty.hypotheses.create(APP, { hypotheses: [{ hypothesis_id: HYPOTHESIS }] });

        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/hypotheses/batch/`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ hypotheses: [{ hypothesis_id: HYPOTHESIS }] });
    });

    it('create is resent after a 5xx with the same body, so the same ids', async () => {
        const { adapty, calls } = sdk([{ body: {}, status: 503 }, stored]);

        await adapty.hypotheses.create(APP, { hypotheses: [{ hypothesis_id: HYPOTHESIS, title: 'x' }] });

        expect(calls.map(call => call.url.replace(BASE, ''))).to.deep.equal([`/apps/${APP}/hypotheses/batch/`, `/apps/${APP}/hypotheses/batch/`]);
        expect(calls[1]?.body).to.equal(calls[0]?.body);
    });

    it('a transition is resent after a 5xx: the server replays one already made', async () => {
        const { adapty, calls } = sdk([{ body: {}, status: 503 }, { body: { hypothesis_id: 'h' } }]);

        await adapty.hypotheses.dismiss(APP, 'h', undefined);

        expect(calls).to.have.length(2);
        expect(calls[1]?.url).to.equal(`${BASE}/apps/${APP}/hypotheses/h/dismiss/`);
    });

    it('dismiss sends the reason when there is one', async () => {
        const { adapty, calls } = sdk([{ body: {} }, { body: {} }]);

        await adapty.hypotheses.dismiss(APP, 'h', 'Shipped');
        await adapty.hypotheses.dismiss(APP, 'h', undefined);

        expect(calls.map(call => call.body)).to.deep.equal([JSON.stringify({ reason: 'Shipped' }), JSON.stringify({})]);
    });

    it('accept sends its body', async () => {
        const { adapty, calls } = sdk([{ body: {} }]);

        await adapty.hypotheses.accept(APP, 'h', { variantFlowId: 'vf' });

        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/hypotheses/h/accept/`);
        expect(JSON.parse(calls[0]?.body ?? '')).to.deep.equal({ variant: { variant_flow_id: 'vf' } });
    });

    it('list refuses a filter value with a comma, with no request', async () => {
        const { adapty, calls } = sdk([]);

        expect(await rejection(adapty.hypotheses.list(APP, { types: ['a:b,c:d'] }))).to.have.property('kind', 'validation');
        expect(calls).to.have.length(0);
    });

    it('get and list read their routes, list with its filters', async () => {
        const { adapty, calls } = sdk([{ body: {} }, { body: { data: [] } }]);

        await adapty.hypotheses.get(APP, 'h');
        await adapty.hypotheses.list(APP, { states: ['proposed', 'accepted'] });

        expect(calls[0]?.url).to.equal(`${BASE}/apps/${APP}/hypotheses/h/`);
        expect(decodeURIComponent(calls[1]?.url ?? '')).to.equal(`${BASE}/apps/${APP}/hypotheses/?filter[state]=proposed,accepted`);
    });

    it('link, resolve and reresolve send their one field', async () => {
        const { adapty, calls } = sdk([{ body: {} }, { body: {} }, { body: {} }]);

        await adapty.hypotheses.link(APP, 'h', 't');
        await adapty.hypotheses.resolve(APP, 'h', 'won');
        await adapty.hypotheses.reresolve(APP, 'h', 'lost');

        expect(calls.map(call => [call.url.replace(BASE, ''), JSON.parse(call.body ?? '') as unknown])).to.deep.equal([
            [`/apps/${APP}/hypotheses/h/link/`, { ab_test_id: 't' }],
            [`/apps/${APP}/hypotheses/h/resolve/`, { result: 'won' }],
            [`/apps/${APP}/hypotheses/h/reresolve/`, { result: 'lost' }],
        ]);
    });

    it('summary and by-ab-test read their own routes', async () => {
        const { adapty, calls } = sdk([{ body: { data: [] } }, { body: { data: [] } }]);

        await adapty.hypotheses.summary(APP);
        await adapty.hypotheses.byAbTest(APP, 't');

        expect(calls.map(call => call.url.replace(BASE, ''))).to.deep.equal([
            `/apps/${APP}/hypotheses/summary/`,
            `/apps/${APP}/hypotheses/by-ab-test/t/`,
        ]);
    });
});
