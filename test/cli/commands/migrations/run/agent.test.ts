import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { buildHandoff, PATH_SEGMENT, repository } from '../../../../../src/cli/commands/migrations/run/lib/agent.js';

describe('migrations run: agent handoff', () => {
    const migrationId = '0b5d3f6e-8c2a-4e1f-9a7b-3d6c8e2f1a4b';
    const dir = `/repo/.git/adapty/${migrationId}`;

    const handoff = buildHandoff({
        actionId: 'design_paywall',
        files: [`\`paywall-designs\`: ${dir}/paywall-designs.json`, `\`paywall-design-source\`: ${dir}/paywall-design-source.json`],
        guides: ['Rebuild the paywall design with the flow-generator skill.\n'],
    });

    it('lists where the data went, then hands over the server\'s text as it is', () => {
        expect(handoff.instructions).to.equal([
            'adapty-cli wrote this migration\'s data to:',
            `- \`paywall-designs\`: ${dir}/paywall-designs.json`,
            `- \`paywall-design-source\`: ${dir}/paywall-design-source.json`,
            '',
            'Rebuild the paywall design with the flow-generator skill.',
        ].join('\n'));
    });

    it('returns the action and the files next to the text, for --json', () => {
        expect(handoff.action_id).to.equal('design_paywall');
        expect(handoff.files).to.have.length(2);
    });

    for (const name of ['report', 'paywall-design-source', migrationId]) {
        it(`takes "${name}" as a path segment`, () => {
            expect(PATH_SEGMENT.test(name)).to.equal(true);
        });
    }

    for (const name of ['../package', 'a/b', '.hidden', 'Report', '']) {
        it(`refuses "${name}" as a path segment`, () => {
            expect(PATH_SEGMENT.test(name)).to.equal(false);
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
