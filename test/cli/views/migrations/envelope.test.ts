import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';

import { renderEnvelope } from '../../../../src/cli/views/migrations/envelope/envelope.js';

import type { Envelope } from '../../../../src/sdk/adapty/index.js';

const FIXTURE_PATH = fileURLToPath(new URL('../../../fixtures/migration-envelope.json', import.meta.url));
const ENVELOPE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Envelope;

const withMigration = (patch: Partial<Envelope['migration']>): Envelope =>
    ({ ...ENVELOPE, migration: { ...ENVELOPE.migration, ...patch } });

describe('renderEnvelope', () => {
    it('opens with where the migration is and what the server says about it', () => {
        const lines = renderEnvelope(ENVELOPE).split('\n');

        expect(lines[0]).to.equal('mig_01H9Z  main  action_required');
        expect(lines[1]).to.equal('App: Demo (app_1)');
        expect(lines[2]).to.equal('Waiting on your confirmation to migrate paywalls');
        expect(lines[3]).to.equal('Progress: 2 of 5 steps');
    });

    it('says the app is not there yet instead of printing an empty name', () => {
        expect(renderEnvelope(withMigration({ app: null }))).to.contain('App: not created yet');
    });

    it('preserves an unknown state and explains that the CLI needs updating', () => {
        const result = renderEnvelope(withMigration({ state: 'paused_for_review' }));

        expect(result).to.contain('mig_01H9Z  main  paused_for_review');
        expect(result).to.contain(ENVELOPE.migration.summary);
        expect(result).to.contain('This migration state needs a newer adapty-cli');
    });

    for (const state of ['running', 'action_required', 'completed', 'failed', 'canceled']) {
        it(`does not suggest an upgrade for the known state ${state}`, () => {
            expect(renderEnvelope(withMigration({ state }))).to.not.contain('needs a newer adapty-cli');
        });
    }

    it('leaves out an unknown total rather than printing null', () => {
        const result = renderEnvelope(withMigration({ progress: { done: 12, total: null, unit: 'profiles' } }));

        expect(result).to.contain('Progress: 12 profiles');
    });

    it('lists what to do next, its instruction, what to read first and that it needs --yes', () => {
        const result = renderEnvelope(ENVELOPE);

        expect(result).to.contain('Do next:');
        expect(result).to.contain('  act_confirm_paywalls  (input)  Migrate paywalls');
        expect(result).to.contain('    This will replace the paywalls in the target app.');
        expect(result).to.contain('    Read first: adapty migrations show step_paywalls -m mig_01H9Z');
        expect(result).to.contain('    Confirmation:\n      This cannot be undone. Continue?');
        expect(result).to.contain('    Review this text before passing --yes.');
    });

    it('keeps every line of confirmation text and marks uploads as unsupported', () => {
        const result = renderEnvelope({
            ...ENVELOPE,
            next_actions: [{
                action_id: 'upload_data',
                confirm: 'Existing data will be replaced.\nReview the report first.',
                detail: null,
                kind: 'upload',
                reads: [],
                step_id: 'import',
                title: 'Upload data',
            }],
        });

        expect(result).to.contain('      Existing data will be replaced.\n      Review the report first.');
        expect(result).to.contain('File uploads are not supported by this CLI.');
        expect(result).to.contain('Use the dashboard or an offered Cloud Export action.');
        expect(result).to.not.contain('--yes');
        expect(result).to.not.contain('needs a newer adapty-cli');
    });

    it('keeps optional actions apart from the ones that block the migration, and prints their link', () => {
        const result = renderEnvelope(ENVELOPE);

        expect(result).to.contain('Also available:');
        expect(result).to.contain('  act_open_report  (external)  Open migration report');
        expect(result).to.contain('    https://app.adapty.io/migrations/mig_01H9Z/report');
        expect(result).to.contain('Readable now: report');
    });

    it('prints an action of a kind it does not know, and admits the CLI is behind', () => {
        const unknown = {
            ...ENVELOPE,
            next_actions: [{
                action_id: 'act_new',
                confirm: null,
                detail: null,
                href: 'https://app.adapty.io/whatever',
                kind: 'telepathy',
                reads: [],
                step_id: 'step_paywalls',
                title: 'Something newer',
            }],
        } satisfies Envelope;

        const result = renderEnvelope(unknown);

        expect(result).to.contain('  act_new  (telepathy)  Something newer');
        expect(result).to.contain('    https://app.adapty.io/whatever');
        expect(result).to.contain('    This action needs a newer adapty-cli');
    });

    it('says nothing about sections the envelope left empty', () => {
        const quiet = { ...ENVELOPE, available_actions: [], next_actions: [], resources: [] } satisfies Envelope;
        const result = renderEnvelope(quiet);

        expect(result).to.not.contain('Do next:');
        expect(result).to.not.contain('Also available:');
        expect(result).to.not.contain('Readable now:');
    });
});
