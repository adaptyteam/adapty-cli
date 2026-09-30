import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

const ROOT = join(import.meta.dirname, '..', '..');

/**
 * The built CLI in a child process whose PATH holds only the stubs a test writes: each stub logs how
 * it was called and exits as told. Neither stdin nor stdout is a terminal there, so nobody can
 * answer a prompt — the case the choice has to handle without one.
 */
// The stubs are POSIX scripts; on Windows only the case that needs no stub runs.
const posix = process.platform === 'win32' ? it.skip : it;

describe('skills install', () => {
    let dir: string;

    const stub = async (bin: string, code = 0): Promise<void> => {
        await writeFile(join(dir, bin), `#!/bin/sh\necho "${bin} $*" >> "${join(dir, 'calls.log')}"\nexit ${String(code)}\n`);
        await chmod(join(dir, bin), 0o755);
    };

    const calls = async (): Promise<string> => readFile(join(dir, 'calls.log'), 'utf8').catch(() => '');

    const install = (...args: string[]): { status: number | null; stderr: string; stdout: string } => spawnSync(
        process.execPath,
        [join(ROOT, 'bin/run.js'), 'skills', 'install', ...args],
        { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: dir }, timeout: 10_000 },
    );

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'adapty-skills-'));
    });

    afterEach(async () => {
        await rm(dir, { force: true, recursive: true });
    });

    posix('prints the skills CLI command instead of running it when nobody can say yes', async () => {
        await stub('npx');

        const { status, stdout } = install('--json');

        const { error } = JSON.parse(stdout) as { error: { code: string; message: string } };

        expect(status).to.equal(2);
        expect(error.code).to.equal('fallback_confirmation_required');
        expect(error.message).to.contain('run `npx skills@1.7.0 add adaptyteam/adapty-skills --all --global` yourself');
        expect(await calls()).to.equal('');
    });

    it('says so when there is not even npx to fall back on', () => {
        const { status, stderr } = install();

        expect(status).to.equal(1);
        expect(stderr).to.contain('Found none of `claude`, `codex`, `gemini`, and no `npx`');
    });

    posix('installs the one agent found without asking', async () => {
        await stub('codex');

        const { status, stdout } = install('--json');

        expect(status).to.equal(0);
        expect(JSON.parse(stdout)).to.deep.equal([{ agent: 'codex', installed: true }]);
    });

    posix('refuses to guess when several agents are found and nobody can choose', async () => {
        await stub('claude');
        await stub('codex');

        const { status, stdout } = install('--json');

        expect(status).to.equal(2);

        expect(JSON.parse(stdout)).to.deep.equal({ error: {
            code: 'agent_choice_required',
            message: 'Found Claude Code, Codex. Choose with --agent, or pass --yes to install into all of them.',
        } });

        expect(await calls()).to.equal('');
    });

    posix('does not run the skills CLI on --yes, which covers the agents it found only', async () => {
        await stub('npx');

        const { status } = install('--yes', '--json');

        expect(status).to.equal(2);
        expect(await calls()).to.equal('');
    });

    posix('installs into every agent found with --yes', async () => {
        await stub('claude');
        await stub('codex');

        const { status, stdout } = install('--yes', '--json');

        expect(status).to.equal(0);

        expect(JSON.parse(stdout)).to.deep.equal([
            { agent: 'claude-code', installed: true },
            { agent: 'codex', installed: true },
        ]);
    });

    posix('installs only the agent asked for, and reports one asked for that is not on PATH', async () => {
        await stub('claude');
        await stub('codex');

        const { status, stdout } = install('--agent', 'claude-code', '--agent', 'gemini-cli', '--json');

        expect(status).to.equal(1);

        expect(JSON.parse(stdout)).to.deep.equal([
            { agent: 'gemini-cli', error: '`gemini` is not on PATH', installed: false },
            { agent: 'claude-code', installed: true },
        ]);

        expect(await calls()).to.not.contain('codex');
    });
});
