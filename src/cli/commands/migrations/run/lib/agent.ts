import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const git = promisify(execFile);

export const repositoryRoot = async (cwd: string): Promise<string | undefined> => {
    try {
        return (await git('git', ['rev-parse', '--show-toplevel'], { cwd })).stdout.trim();
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
        + 'If this session does not have the skill, run `adapty skills install`, then restart the agent.',
        '',
        '- Before changing any file, create a branch: `git switch -c adapty-migrate`. Leave the changes uncommitted for '
        + 'the developer to review.',
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
        + '\'{"summary": "<one sentence: what changed and how many steps ADAPTY_SETUP.md leaves>"}\'`.',
    ].join('\n'),
});
