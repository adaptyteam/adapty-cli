import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const git = promisify(execFile);

/** In a worktree or a submodule `.git` is a file, so the git directory comes from git itself. */
export const repository = async (cwd: string): Promise<{ gitDir: string; root: string } | undefined> => {
    try {
        const { stdout } = await git('git', ['rev-parse', '--show-toplevel', '--absolute-git-dir'], { cwd });
        const [root, gitDir] = stdout.trim().split('\n');

        if (root === undefined || gitDir === undefined) {
            return undefined;
        }

        // git prints forward slashes on Windows too: resolve() gives the platform's own form.
        return { gitDir: resolve(gitDir), root: resolve(root) };
    } catch {
        return undefined;
    }
};

export type HandoffInput = {
    actionId: string;
    appId: string;
    /** `name`: path, one per resource written to a file. */
    files: string[];
    /** Markdown resources, handed to the agent as they are. */
    guides: string[];
    migrationId: string;
};

/** What `--json` returns for an agent action, and what the human view prints. */
export type Handoff = { action_id: string; files: string[]; instructions: string };

/**
 * The lines only the CLI can write: which skill, where the data is, how to report back. What the data
 * means comes from the server, in `guides`.
 */
export const buildHandoff = ({ actionId, appId, files, guides, migrationId }: HandoffInput): Handoff => ({
    action_id: actionId,
    files,
    instructions: [
        'Migrate this app from RevenueCat to Adapty with the adapty-integration skill, in RevenueCat migration mode. '
        + 'If this session does not have the skill, run `adapty skills install --agent <claude-code, codex or gemini-cli: '
        + 'the agent you are>`, then restart the agent.',
        '',
        '- Before changing any file, create a branch: `git switch -c adapty-migrate`, or `adapty-migrate-2` and so on '
        + 'when that name is taken. Leave the changes uncommitted for the developer to review.',
        `- The Adapty app is ${appId}. The migration already created its catalog: do not create again anything the `
        + 'report lists as created.',
        '- paywallApproach comes from `code-plan`, per placement: `native` is the skill\'s `custom`, `flow_builder` is '
        + '`flow_builder`.',
        `- The skill's run ID is ${migrationId}. \`adapty migrations show <resource> -m ${migrationId}\` reads this migration.`,
        '',
        'The migration\'s data:',
        ...files.map(file => `- ${file}`),
        '',
        ...guides.flatMap(guide => [guide.trim(), '']),
        `When the code is done, report it: \`adapty migrations run ${actionId} -m ${migrationId} --input `
        + '\'{"summary": "<one sentence: what changed and how many steps ADAPTY_SETUP.md leaves>"}\'`. The migration '
        + `stays open and keeps the summary: the developer closes it with \`adapty migrations close -m ${migrationId} `
        + '--outcome finish`.',
    ].join('\n'),
});
