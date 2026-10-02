import { expect } from 'chai';

import { pollNotice } from '../../../../../src/cli/commands/migrations/status/lib/notice.js';

import type { Envelope, Progress } from '../../../../../src/sdk/adapty/index.js';

const envelopeWith = (progress: Progress | null): Envelope => ({
    available_actions: [],
    issues: [],
    migration: {
        app: null,
        created_at: '2026-09-14T09:00:00Z',
        flow: 'main',
        id: 'mig_1',
        poll_after_seconds: 30,
        progress,
        revision: 1,
        state: 'running',
        summary: 'Creating the catalog in Adapty',
        updated_at: '2026-09-14T09:00:00Z',
    },
    next_actions: [],
    resources: [],
    result: null,
    steps: [],
});

describe('migrations status poll notice', () => {
    it('says what the server is doing and when it will be asked again', () => {
        const notice = pollNotice(envelopeWith({ done: 12, total: 47, unit: 'entities' }), 30_000);

        expect(notice).to.equal('running  12 of 47 entities — checking again in 30s');
    });

    it('counts what is done while the server does not know the total yet', () => {
        const notice = pollNotice(envelopeWith({ done: 1200, total: null, unit: 'profiles' }), 5000);

        expect(notice).to.equal('running  1200 profiles — checking again in 5s');
    });

    it('still reports the state when there is no progress to report', () => {
        const notice = pollNotice(envelopeWith(null), 5000);

        expect(notice).to.equal('running — checking again in 5s');
    });
});
