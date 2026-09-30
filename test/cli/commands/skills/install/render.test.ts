import { expect } from 'chai';

import { renderInstall } from '../../../../../src/cli/commands/skills/install/lib/render.js';

describe('renderInstall', () => {
    it('says what to do after an install, why one failed, and how to reach another agent', () => {
        expect(renderInstall([
            { agent: 'claude-code', installed: true },
            { agent: 'codex', error: 'Plugin not found', installed: false },
        ])).to.equal([
            '✓ Claude Code: installed. Restart it to load the skills.',
            '✗ Codex: Plugin not found',
            '',
            'Another agent? Run `npx skills@1.7.0 add adaptyteam/adapty-skills --all --global`.',
        ].join('\n'));
    });

    it('drops the pointer to the skills CLI once the skills CLI was the one that ran', () => {
        expect(renderInstall([{ agent: 'other', installed: true }]))
            .to.equal('✓ Other agents (skills CLI): installed. Restart it to load the skills.');
    });

    it('puts a warning under the install it belongs to', () => {
        expect(renderInstall([{ agent: 'claude-code', installed: true, warning: 'check the marketplace' }]).split('\n').slice(0, 2))
            .to.deep.equal(['✓ Claude Code: installed. Restart it to load the skills.', '  Warning: check the marketplace']);
    });
});
