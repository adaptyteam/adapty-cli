import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { buildHandoff, repository, RESOURCE_FILE_NAME } from '../../../../../src/cli/commands/migrations/run/lib/agent.js';

describe('migrations run: agent handoff', () => {
    const handoff = buildHandoff({
        actionId: 'migrate_code',
        files: ['`report`: /repo/.git/adapty/report.json', '`code-plan`: /repo/.git/adapty/code-plan.json'],
        guides: ['Migrate this app with the adapty-integration skill.\n'],
    });

    it('lists where the data went, then hands over the server\'s text as it is', () => {
        expect(handoff.instructions).to.equal([
            'adapty-cli wrote this migration\'s data to:',
            '- `report`: /repo/.git/adapty/report.json',
            '- `code-plan`: /repo/.git/adapty/code-plan.json',
            '',
            'Migrate this app with the adapty-integration skill.',
        ].join('\n'));
    });

    it('returns the action and the files next to the text, for --json', () => {
        expect(handoff.action_id).to.equal('migrate_code');
        expect(handoff.files).to.have.length(2);
    });

    for (const name of ['report', 'code-plan']) {
        it(`writes the resource ${name} to a file of its own name`, () => {
            expect(RESOURCE_FILE_NAME.test(name)).to.equal(true);
        });
    }

    for (const name of ['../package', 'a/b', '.hidden', 'Report', '']) {
        it(`refuses "${name}" as a file name`, () => {
            expect(RESOURCE_FILE_NAME.test(name)).to.equal(false);
        });
    }

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

            expect(found?.gitDir).to.equal(join(dir, 'app', '.git', 'worktrees', 'tree'));
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
            await mkdir(join(found!.gitDir, 'adapty'), { recursive: true });
        });

        it('finds nothing outside a repository', async () => {
            expect(await repository(dir)).to.equal(undefined);
        });
    });
});
