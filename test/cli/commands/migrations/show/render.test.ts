import { expect } from 'chai';

import { renderResources, renderResult } from '../../../../../src/cli/commands/migrations/show/lib/render.js';

import type { Envelope, ResourceRef } from '../../../../../src/sdk/adapty/index.js';

const envelopeWith = (resources: ResourceRef[], result: unknown = null): Envelope => ({
    available_actions: [],
    issues: [],
    migration: {
        app: null,
        created_at: '2026-09-14T09:00:00Z',
        flow: 'main',
        id: 'mig_1',
        poll_after_seconds: 5,
        progress: null,
        revision: 1,
        state: 'action_required',
        summary: 'Connect RevenueCat first',
        updated_at: '2026-09-14T09:00:00Z',
    },
    next_actions: [],
    resources,
    result,
    steps: [],
});

describe('migrations show views', () => {
    it('lists what can be read now and shows how to read the first of them', () => {
        const result = renderResources(envelopeWith([
            { name: 'apps', title: 'RevenueCat apps' },
            { name: 'mapping', title: 'RC → Adapty mapping' },
        ]));

        expect(result.split('\n')).to.deep.equal([
            'Readable now:',
            '  apps     RevenueCat apps',
            '  mapping  RC → Adapty mapping',
            '',
            'Read one: `adapty migrations show apps -m mig_1`',
        ]);
    });

    it('says why there is nothing to read rather than printing an empty list', () => {
        expect(renderResources(envelopeWith([]))).to.equal('Nothing to read yet: Connect RevenueCat first');
    });

    it('prints the resource as JSON, whatever shape the flow gave it', () => {
        const rows = [{ rc_id: 'prod_1', status: 'needs_decision' }];

        expect(renderResult(envelopeWith([], rows))).to.equal(JSON.stringify(rows, null, 2));
        expect(renderResult(envelopeWith([], { markdown: '# Report' }))).to.equal('{\n  "markdown": "# Report"\n}');
    });

    it('tells a resource that is empty apart from a resource that is not there', () => {
        // The server answered with the envelope, so the name was right: only the data is missing.
        expect(renderResult(envelopeWith([]))).to.equal('No data in this resource yet: Connect RevenueCat first');
    });
});
