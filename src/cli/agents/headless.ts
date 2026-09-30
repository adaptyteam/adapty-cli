import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { agents } from './catalog.js';

import type { AgentId } from './catalog.js';

/** The agents that can work on the code with nobody at the keyboard. */
export const headlessAgentIds = ['claude-code', 'codex'] as const satisfies readonly AgentId[];

export type HeadlessAgentId = (typeof headlessAgentIds)[number];

/**
 * What the agent may do on the developer's machine. It ships with this binary, never with a server
 * answer: a server that could widen it could open a shell on every developer's computer.
 */
export const CLAUDE_TOOLS = [
    'Read', 'Glob', 'Grep', 'Write', 'Edit',
    'WebFetch(domain:adapty.io)',
    'Bash(adapty:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)',
];

const RUN_TIMEOUT_MS = 45 * 60_000;

/** Codex has no per-command allowlist: its sandbox keeps writes inside the repository. */
export const headlessArgs = (agent: HeadlessAgentId, prompt: string, lastMessageFile: string): string[] => {
    if (agent === 'claude-code') {
        return ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', CLAUDE_TOOLS.join(',')];
    }

    return [
        'exec', prompt,
        '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true',
        '--skip-git-repo-check', '--output-last-message', lastMessageFile,
    ];
};

/** Claude Code prints one JSON object whose `result` is the agent's last message. */
const claudeResult = (stdout: string): string => {
    try {
        const parsed = JSON.parse(stdout) as { result?: unknown };

        return typeof parsed.result === 'string' ? parsed.result : '';
    } catch {
        return '';
    }
};

export type HeadlessRun = {
    agent: HeadlessAgentId;
    cwd: string;
    env: NodeJS.ProcessEnv;
    prompt: string;
    signal: AbortSignal;
};

type Exit = { code: number | null; stderr: string; stdout: string };

export type HeadlessResult = { code: number | null; finalText: string; stderr: string };

export const runHeadless = async ({ agent, cwd, env, prompt, signal }: HeadlessRun): Promise<HeadlessResult> => {
    const dir = await mkdtemp(join(tmpdir(), 'adapty-agent-'));
    const lastMessageFile = join(dir, 'last-message.txt');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- every headless id is in the table
    const { bin } = agents.find(entry => entry.id === agent)!;

    try {
        const { code, stderr, stdout } = await new Promise<Exit>((resolve) => {
            const child = spawn(bin, headlessArgs(agent, prompt, lastMessageFile), {
                cwd, env: { ...env, NO_COLOR: '1' }, signal, stdio: ['ignore', 'pipe', 'pipe'], timeout: RUN_TIMEOUT_MS,
            });

            let out = '';
            let err = '';

            child.stdout.on('data', (chunk: Buffer) => {
                out += chunk.toString();
            });

            child.stderr.on('data', (chunk: Buffer) => {
                err += chunk.toString();
            });

            child.on('error', (error) => {
                resolve({ code: null, stderr: error.message, stdout: out });
            });

            child.on('close', (exit) => {
                resolve({ code: exit, stderr: err, stdout: out });
            });
        });

        const finalText = agent === 'claude-code'
            ? claudeResult(stdout)
            : await readFile(lastMessageFile, 'utf8').catch(() => '');

        return { code, finalText, stderr };
    } finally {
        await rm(dir, { force: true, recursive: true });
    }
};

/** The agent is asked to end with one `SUMMARY:` line; the last one wins. */
export const extractSummary = (finalText: string): string | undefined => {
    const line = finalText.split('\n').reverse().find(entry => entry.trim().startsWith('SUMMARY:'));
    const summary = line?.trim().slice('SUMMARY:'.length).trim();

    return summary === '' ? undefined : summary;
};
