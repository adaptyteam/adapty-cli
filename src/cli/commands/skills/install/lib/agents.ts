import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

const SOURCE = 'adaptyteam/adapty-skills';
const STDERR_TAIL_LINES = 5;

export const agentIds = ['claude-code', 'codex', 'gemini-cli'] as const;

export type AgentId = (typeof agentIds)[number];

export type Agent<Id extends string = AgentId | 'other'> = { bin: string; id: Id; name: string; steps: string[][] };

/**
 * Each agent's own installer, the same commands the docs' "Install agent tools" modal shows. A
 * marketplace step fails harmlessly when the marketplace is already there, so only the last step
 * decides the outcome.
 */
export const agents: readonly Agent<AgentId>[] = [
    {
        bin: 'claude',
        id: 'claude-code',
        name: 'Claude Code',
        steps: [['plugin', 'marketplace', 'add', SOURCE], ['plugin', 'install', 'adapty-skills@adapty']],
    },
    {
        bin: 'codex',
        id: 'codex',
        name: 'Codex',
        steps: [['plugin', 'marketplace', 'add', SOURCE], ['plugin', 'add', 'adapty-skills@adapty']],
    },
    { bin: 'gemini', id: 'gemini-cli', name: 'Gemini CLI', steps: [['skills', 'install', `https://github.com/${SOURCE}`]] },
];

/** For a machine where none of the agents above is found: the skills CLI detects the rest itself. */
export const fallback: Agent = {
    bin: 'npx',
    id: 'other',
    name: 'Other agents (skills CLI)',
    steps: [['--yes', 'skills', 'add', SOURCE, '--all', '--global']],
};

export const FALLBACK_COMMAND = `npx skills add ${SOURCE} --all --global`;

export type Run = (bin: string, args: readonly string[]) => Promise<{ code: number | null; stderr: string }>;

export type InstallResult = { agent: Agent['id']; error?: string; installed: boolean; warning?: string };

// A Windows agent is a .cmd shim that only a shell resolves.
const windows = process.platform === 'win32';

export const runQuietly: Run = async (bin, args) => new Promise((resolve) => {
    const child = spawn(bin, args, { env: { ...process.env, NO_COLOR: '1' }, shell: windows, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
    });

    child.on('error', (error) => {
        resolve({ code: null, stderr: error.message });
    });

    child.on('close', (code) => {
        resolve({ code, stderr });
    });
});

export const onPath = async (bin: string): Promise<boolean> => {
    const extensions = windows ? (process.env.PATHEXT ?? '.EXE;.CMD').split(';') : [''];

    const candidates = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
        .flatMap(dir => extensions.map(extension => join(dir, bin + extension)));

    for (const candidate of candidates) {
        try {
            await access(candidate, constants.X_OK);

            return true;
        } catch {
            // not in this directory
        }
    }

    return false;
};

const tailOf = (stderr: string): string => stderr.trim().split('\n').slice(-STDERR_TAIL_LINES).join('\n');

export const install = async (agent: Agent, run: Run): Promise<InstallResult> => {
    const results = [];

    for (const step of agent.steps) {
        results.push(await run(agent.bin, step));
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- every agent has at least one step
    const last = results.at(-1)!;

    if (last.code !== 0) {
        const error = tailOf(last.stderr) || `\`${agent.bin}\` exited with code ${String(last.code)}`;

        return { agent: agent.id, error, installed: false };
    }

    // A marketplace that is already there fails the step, whether it is ours or another source under
    // the same name; only the second installs someone else's skills, and the CLI cannot tell them apart.
    const marketplace = results.length > 1 ? results[0] : undefined;

    if (marketplace !== undefined && marketplace.code !== 0) {
        const warning = `adding the marketplace failed (${tailOf(marketplace.stderr) || 'no message'}). If an \`adapty\` `
            + `marketplace already existed, the skills came from its source: check it with \`${agent.bin} plugin marketplace list\`.`;

        return { agent: agent.id, installed: true, warning };
    }

    return { agent: agent.id, installed: true };
};
