import { expect } from 'chai';

import { buildHandoff } from '../../../../../src/cli/commands/migrations/run/lib/agent.js';

describe('migrations run: agent handoff', () => {
    const handoff = buildHandoff({
        actionId: 'migrate_code',
        appId: 'app_1',
        files: ['`report`: .git/adapty/report.json', '`code-plan`: .git/adapty/code-plan.json'],
        guides: ['How to read the report.\n'],
        migrationId: 'mig_1',
    });

    it('names the skill, the app, the migration as the run ID, and every file the server data went to', () => {
        expect(handoff.instructions).to.contain('the adapty-integration skill');
        expect(handoff.instructions).to.contain('The Adapty app is app_1');
        expect(handoff.instructions).to.contain('The skill\'s run ID is mig_1.');
        expect(handoff.instructions).to.contain('- `report`: .git/adapty/report.json\n- `code-plan`: .git/adapty/code-plan.json');
    });

    it('carries the server\'s guide as it is, then the command that reports the result back', () => {
        expect(handoff.instructions).to.contain('\nHow to read the report.\n\nWhen the code is done, report it: '
            + '`adapty migrations run migrate_code -m mig_1 --input \'{"summary": ');
    });

    it('returns the action and the files next to the text, for --json', () => {
        expect(handoff.action_id).to.equal('migrate_code');
        expect(handoff.files).to.have.length(2);
    });
});
