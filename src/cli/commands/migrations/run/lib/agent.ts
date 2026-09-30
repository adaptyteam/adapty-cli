import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const git = promisify(execFile);

/** In a worktree or a submodule `.git` is a file, so the git directory comes from git itself. */
export const repository = async (cwd: string): Promise<{ gitDir: string } | undefined> => {
    try {
        const { stdout } = await git('git', ['rev-parse', '--absolute-git-dir'], { cwd });
        const gitDir = stdout.trim();

        // git prints forward slashes on Windows too: resolve() gives the platform's own form.
        return gitDir === '' ? undefined : { gitDir: resolve(gitDir) };
    } catch {
        return undefined;
    }
};

export type HandoffInput = {
    actionId: string;
    /** `name`: absolute path, one per resource written to a file. */
    files: string[];
    /** Markdown resources, the server's instructions for this migration, handed to the agent as they are. */
    guides: string[];
};

/** What `--json` returns for an agent action, and what the human view prints. */
export type Handoff = { action_id: string; files: string[]; instructions: string };

/** A resource name becomes a file name, so it may only be one: no separators, no dots to climb out with. */
export const RESOURCE_FILE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The server says what to do; the CLI adds the one thing only it knows, where it put the data. Paths
 * are absolute, so they open from any folder the agent runs in, a monorepo's app folder included.
 */
export const buildHandoff = ({ actionId, files, guides }: HandoffInput): Handoff => ({
    action_id: actionId,
    files,
    instructions: [
        'adapty-cli wrote this migration\'s data to:',
        ...files.map(file => `- ${file}`),
        '',
        ...guides.map(guide => guide.trim()),
    ].join('\n'),
});
