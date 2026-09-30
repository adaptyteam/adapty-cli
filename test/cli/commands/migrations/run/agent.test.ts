import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { buildHandoff, repository } from '../../../../../src/cli/commands/migrations/run/lib/agent.js';

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
        expect(handoff.instructions).to.contain('`adapty skills install --agent <claude-code, codex or gemini-cli');
        expect(handoff.instructions).to.contain('create a branch: `git switch -c adapty-migrate`, or `adapty-migrate-2`');
        expect(handoff.instructions).to.contain('The Adapty app is app_1');
        expect(handoff.instructions).to.contain('The skill\'s run ID is mig_1.');
        expect(handoff.instructions).to.contain('- `report`: .git/adapty/report.json\n- `code-plan`: .git/adapty/code-plan.json');
    });

    it('carries the server\'s guide as it is, then the command that reports the result back', () => {
        expect(handoff.instructions).to.contain('\nHow to read the report.\n\nWhen the code is done, report it: '
            + '`adapty migrations run migrate_code -m mig_1 --input \'{"summary": ');

        expect(handoff.instructions).to.contain('the developer closes it with `adapty migrations close -m mig_1 --outcome finish`.');
    });

    it('returns the action and the files next to the text, for --json', () => {
        expect(handoff.action_id).to.equal('migrate_code');
        expect(handoff.files).to.have.length(2);
    });

    describe('repository', () => {
        // Windows paths from git and from a temp directory differ in form, not in meaning.
        const posix = process.platform === 'win32' ? it.skip : it;

        let dir: string;

        const git = (cwd: string, ...args: string[]): void => {
            execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'ignore' });
        };

        beforeEach(async () => {
            dir = await realpath(await mkdtemp(join(tmpdir(), 'adapty-repo-')));
            git(dir, 'init', '-q', 'app');
            git(join(dir, 'app'), 'commit', '-q', '--allow-empty', '-m', 'init');
        });

        afterEach(async () => {
            await rm(dir, { force: true, recursive: true });
        });

        posix('finds the git directory of a worktree, where .git is a file, and it takes the data', async () => {
            git(join(dir, 'app'), 'worktree', 'add', '-q', join(dir, 'tree'));

            const found = await repository(join(dir, 'tree'));

            expect(found?.root).to.equal(join(dir, 'tree'));
            expect(found?.gitDir).to.equal(join(dir, 'app', '.git', 'worktrees', 'tree'));
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
            await mkdir(join(found!.gitDir, 'adapty'), { recursive: true });
        });

        it('finds nothing outside a repository', async () => {
            expect(await repository(dir)).to.equal(undefined);
        });
    });
});
