import { expect } from 'chai';

import { renderSteps } from '../../../../../src/cli/commands/migrations/steps/lib/render.js';

import type { Envelope, Step } from '../../../../../src/sdk/adapty/index.js';

const envelopeWith = (steps: Step[]): Envelope => ({
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
        summary: 'Nothing planned yet',
        updated_at: '2026-09-14T09:00:00Z',
    },
    next_actions: [],
    resources: [],
    result: null,
    steps,
});

const step = (stepId: string, status: Step['status'], summary: string | null = null): Step => ({
    status,
    step_id: stepId,
    summary,
    title: `Title of ${stepId}`,
});

describe('renderSteps', () => {
    it('marks each step and keeps the order the server sent', () => {
        const result = renderSteps(envelopeWith([
            step('step_apps', 'done', '2 apps migrated'),
            step('step_paywalls', 'active'),
            step('step_products', 'locked'),
        ]));

        expect(result.split('\n')).to.deep.equal([
            '[x] step_apps      Title of step_apps  2 apps migrated',
            '[>] step_paywalls  Title of step_paywalls',
            '[ ] step_products  Title of step_products',
        ]);
    });

    it('prints a status it has never heard of instead of guessing a mark', () => {
        const future = { ...step('step_new', 'locked'), status: 'skipped' } as unknown as Step;

        const result = renderSteps(envelopeWith([future, step('step_apps', 'done')]));

        expect(result.split('\n')).to.deep.equal([
            '[skipped] step_new   Title of step_new',
            '[x]       step_apps  Title of step_apps',
        ]);
    });

    it('says why the checklist is empty rather than printing nothing', () => {
        expect(renderSteps(envelopeWith([]))).to.equal('No steps yet: Nothing planned yet');
    });
});
