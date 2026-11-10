import { expect } from 'chai';

import {
    findDraft,
    hasPublishedHistory,
    renameRequest,
    restoreRequest,
    versionDate,
    versionPublication,
} from '../../../src/sdk/adapty/flow-versions.js';
import { FLOW_READ_LIMIT, isNeverPublished } from '../../../src/sdk/adapty/flows.js';
import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

import type { FlowVersionRow } from '../../../src/sdk/adapty/index.js';

const BASE = 'https://api.example.com/v1';

const row = (fields: Partial<FlowVersionRow>): FlowVersionRow => ({
    created_at: '2026-10-01T09:00:00Z',
    flow_version_id: 'v',
    is_current: false,
    last_edited_by: null,
    name: null,
    publication_status: null,
    published_at: null,
    state: 'previous',
    title: 'Version 1',
    updated_at: 0,
    version: 0,
    ...fields,
});

describe('flow version rules', () => {
    it('versionDate: a draft by its creation, a published version by its publish, an unpublished one by its creation', () => {
        expect(versionDate(row({ published_at: '2026-11-09T07:00:00Z', state: 'draft' }))).to.equal('2026-10-01T09:00:00Z');
        expect(versionDate(row({ published_at: '2026-10-21T12:00:00Z', state: 'live' }))).to.equal('2026-10-21T12:00:00Z');
        expect(versionDate(row({ state: 'previous' }))).to.equal('2026-10-01T09:00:00Z');
    });

    it('versionPublication: publishing or failed only on the draft', () => {
        expect(versionPublication(row({ publication_status: 'failed', state: 'draft' }))).to.equal('failed');
        expect(versionPublication(row({ publication_status: 'transforming', state: 'draft' }))).to.equal('publishing');
        expect(versionPublication(row({ publication_status: 'failed', state: 'previous' }))).to.equal(undefined);
        expect(versionPublication(row({ publication_status: 'published', state: 'draft' }))).to.equal(undefined);
        expect(versionPublication(row({ state: 'draft' }))).to.equal(undefined);
    });

    it('hasPublishedHistory and findDraft: only the draft is no history yet', () => {
        const draft = row({ flow_version_id: 'd', state: 'draft' });

        expect(hasPublishedHistory([draft])).to.equal(false);
        expect(hasPublishedHistory([])).to.equal(false);
        expect(hasPublishedHistory([draft, row({ state: 'live' })])).to.equal(true);
        expect(findDraft([row({ state: 'live' }), draft])).to.equal(draft);
        expect(findDraft([row({ state: 'live' })])).to.equal(undefined);
    });

    it('renameRequest: an empty or blank name is null, any other name goes as written', () => {
        expect(renameRequest('')).to.deep.equal({ name: null });
        expect(renameRequest('   ')).to.deep.equal({ name: null });
        expect(renameRequest(null)).to.deep.equal({ name: null });
        expect(renameRequest(' Black Friday ')).to.deep.equal({ name: ' Black Friday ' });
    });

    it('restoreRequest: {} with no draft, the confirmation and the token with one', () => {
        expect(restoreRequest()).to.deep.equal({});

        expect(restoreRequest({ expectedUpdatedAt: 42 }))
            .to.deep.equal({ expected_updated_at: 42, replace_draft: true });
    });

    it('isNeverPublished: only an explicit null; an older server that omits the field says nothing', () => {
        expect(isNeverPublished({ id: 'f', name: 'F', published_flow_version_id: null })).to.equal(true);
        expect(isNeverPublished({ id: 'f', name: 'F', published_flow_version_id: 'v' })).to.equal(false);
        expect(isNeverPublished({ id: 'f', name: 'F' })).to.equal(false);
    });
});

describe('adapty.flows.versions and adapty.flows.duplicate', () => {
    const setup = (script: Parameters<typeof createScriptedFetch>[0]) => {
        const scripted = createScriptedFetch(script);
        const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

        return { calls: scripted.calls, flows: adapty.flows };
    };

    it('does not repeat a restore or a duplicate after a 503: a second one would write again', async () => {
        for (const call of ['restore', 'duplicate'] as const) {
            const { calls, flows } = setup([{ status: 503 }, { body: {} }]);
            const write = call === 'restore' ? flows.versions.restore('a', 'f', 'v') : flows.duplicate('a', 'f');

            const error = await rejection(write);

            expect(error, call).to.have.property('status', 503);
            expect(calls, call).to.have.length(1);
        }
    });

    it('repeats a list GET after a 503', async () => {
        const empty = { data: [], meta: { pagination: { count: 0, page: 1, pages: 1 } } };
        const { calls, flows } = setup([{ status: 503 }, { body: empty }]);

        const page = await flows.versions.list('a', 'f');

        expect(page.data).to.deep.equal([]);
        expect(calls.map(call => call.method)).to.deep.equal(['GET', 'GET']);
    });

    it('neverPublished reads every flow with never more than FLOW_READ_LIMIT reads in flight', async () => {
        const ids = Array.from({ length: 12 }, (_, index) => `f${index}`);
        let inFlight = 0;
        let most = 0;
        const read: string[] = [];

        const fetch = async (input: Request | string | URL): Promise<Response> => {
            const url = String(input instanceof Request ? input.url : input);
            const id = url.split('/').at(-2) ?? '';

            inFlight += 1;
            most = Math.max(most, inFlight);
            await new Promise(resolve => setImmediate(resolve));
            inFlight -= 1;
            read.push(id);

            // f3 fails: its row only loses the note
            return id === 'f3'
                ? new Response('{}', { status: 404 })
                : Response.json({ id, name: id, published_flow_version_id: id === 'f7' || id === 'f3' ? null : 'v' });
        };

        const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch, token: 't' });
        const unpublished = await adapty.flows.neverPublished('a', ids);

        expect(FLOW_READ_LIMIT).to.equal(5);
        expect(most).to.equal(FLOW_READ_LIMIT);
        expect([...read].sort()).to.deep.equal([...ids].sort());
        expect([...unpublished]).to.deep.equal(['f7']);
    });

    it('neverPublished: a never-published flow is in, a published one and one that cannot be read are not', async () => {
        const { calls, flows } = setup([
            { body: { id: 'f1', name: 'A', published_flow_version_id: null } },
            { body: { id: 'f2', name: 'B', published_flow_version_id: 'v' } },
            { status: 404 },
        ]);

        const unpublished = await flows.neverPublished('a', ['f1', 'f2', 'f3']);

        expect([...unpublished]).to.deep.equal(['f1']);
        expect(calls.map(call => call.url)).to.deep.equal(['f1', 'f2', 'f3'].map(id => `${BASE}/apps/a/flows/${id}/`));
    });

    it('preview gives the version id and its link only', async () => {
        const { flows } = setup([{ body: { flow_version_id: 'v', preview_url: 'https://example.com/p', screens: [] } }]);

        expect(await flows.versions.preview('a', 'f', 'v')).to.deep.equal({ flow_version_id: 'v', preview_url: 'https://example.com/p' });
    });

    it('renames with a PATCH of the version path', async () => {
        const { calls, flows } = setup([{ body: { title: 'Version 2' } }]);

        await flows.versions.rename('a', 'f', 'v', '');

        expect(calls[0]?.method).to.equal('PATCH');
        expect(calls[0]?.url).to.equal(`${BASE}/apps/a/flows/f/versions/v/`);
        expect(calls[0]?.body).to.equal('{"name":null}');
    });
});
