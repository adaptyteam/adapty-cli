import { execFile } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const git = promisify(execFile);

/** The agent's work lands on its own branch, so the whole migration reads as one diff and undoes as one. */
export const BRANCH = 'adapty-migrate';

export const repositoryRoot = async (cwd: string): Promise<string | undefined> => {
    try {
        return (await git('git', ['rev-parse', '--show-toplevel'], { cwd })).stdout.trim();
    } catch {
        return undefined;
    }
};

export const hasUncommittedChanges = async (root: string): Promise<boolean> => {
    return (await git('git', ['status', '--porcelain'], { cwd: root })).stdout.trim() !== '';
};

export const switchToBranch = async (root: string): Promise<void> => {
    try {
        await git('git', ['switch', BRANCH], { cwd: root });
    } catch {
        await git('git', ['switch', '-c', BRANCH], { cwd: root });
    }
};

/** The agent's `adapty` is this very CLI, however it was started: installed globally, linked or through npx. */
export const writeCliShim = async (dir: string): Promise<string> => {
    const bin = join(dir, 'bin');
    const shim = join(bin, 'adapty');

    await mkdir(bin, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- node always has the script path
    await writeFile(shim, `#!/bin/sh\nexec "${process.execPath}" "${process.argv[1]!}" "$@"\n`);
    await chmod(shim, 0o755);

    return bin;
};

export type AgentPrompt = {
    appId: string;
    /** `name`: path, one per resource written to a file. */
    files: string[];
    /** Markdown resources, read to the agent as they are. */
    guides: string[];
    migrationId: string;
};

/**
 * The lines only the CLI can write: that nobody is at the keyboard, the skill's Phase 2 answers,
 * where the files are. What the data means comes from the server, in `guides`.
 */
export const buildPrompt = ({ appId, files, guides, migrationId }: AgentPrompt): string => [
    'This app is being migrated from RevenueCat to Adapty by `adapty migrations run migrate_code`. The run is headless: '
    + 'nobody can answer a question, so decide from what is below and record what you cannot decide in ADAPTY_SETUP.md.',
    '',
    'Use the adapty-integration skill in RevenueCat migration mode, with these Phase 2 answers:',
    '- paywallApproach: per placement, from `code-plan`. `native` is the skill\'s `custom`; `flow_builder` is `flow_builder`.',
    '- integrations: none set up in this run; list the ones the code uses in ADAPTY_SETUP.md.',
    `- appPreference: existing. The Adapty app is ${appId}, and the migration already created its catalog: `
    + 'do not create again anything the report lists as created.',
    '- Skip Phase 5: nobody consented to feedback.',
    `- The skill's run ID is ${migrationId}.`,
    '',
    'The `adapty` CLI is installed and signed in: use it as it is, without installing or updating it. '
    + `\`adapty migrations show <resource> -m ${migrationId}\` reads this migration. Read the Adapty docs with WebFetch.`,
    '',
    'Work on the current git branch and commit nothing.',
    '',
    'The migration\'s data:',
    ...files.map(file => `- ${file}`),
    '',
    ...guides.flatMap(guide => [guide.trim(), '']),
    'End with one line that starts with `SUMMARY:` and says, in one sentence, what changed in the code and how many '
    + 'steps ADAPTY_SETUP.md leaves to the developer.',
].join('\n');
