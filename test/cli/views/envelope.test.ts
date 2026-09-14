import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';

import { renderEnvelope } from '../../../src/cli/views/envelope.js';

import type { Envelope } from '../../../src/sdk/adapty/index.js';

const FIXTURE_PATH = fileURLToPath(new URL('../../fixtures/migration-envelope.json', import.meta.url));
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

    it('leaves out an unknown total rather than printing null', () => {
        const result = renderEnvelope(withMigration({ progress: { done: 12, total: null, unit: 'profiles' } }));

        expect(result).to.contain('Progress: 12 profiles');
    });

    it('lists what to do next, its instruction, what to read first and that it needs --yes', () => {
        const result = renderEnvelope(ENVELOPE);

        expect(result).to.contain('Do next:');
        expect(result).to.contain('  act_confirm_paywalls  (input)  Migrate paywalls');
        expect(result).to.contain('    This will replace the paywalls in the target app.');
        expect(result).to.contain('    Read first: adapty migrations show step_paywalls');
        expect(result).to.contain('    Changes production data: needs --yes');
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
