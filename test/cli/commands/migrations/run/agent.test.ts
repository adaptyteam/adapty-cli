import { expect } from 'chai';

import { buildPrompt } from '../../../../../src/cli/commands/migrations/run/lib/agent.js';

describe('migrations run: agent prompt', () => {
    const prompt = buildPrompt({
        appId: 'app_1',
        files: ['`report`: .git/adapty/report.json', '`code-plan`: .git/adapty/code-plan.json'],
        guides: ['How to read the report.\n'],
        migrationId: 'mig_1',
    });

    it('names the app, the migration as the run ID, and every file the server data went to', () => {
        expect(prompt).to.contain('The Adapty app is app_1');
        expect(prompt).to.contain('The skill\'s run ID is mig_1.');
        expect(prompt).to.contain('- `report`: .git/adapty/report.json\n- `code-plan`: .git/adapty/code-plan.json');
    });

    it('carries the server\'s guide as it is, before the closing summary instruction', () => {
        expect(prompt).to.contain('\nHow to read the report.\n\nEnd with one line that starts with `SUMMARY:`');
    });

    it('asks for nothing a headless run cannot give', () => {
        expect(prompt).to.contain('nobody can answer a question');
        expect(prompt).to.contain('Skip Phase 5');
        expect(prompt).to.contain('commit nothing');
    });
});
