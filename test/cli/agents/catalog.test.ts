import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { agents, install, onPath } from '../../../src/cli/agents/catalog.js';

import type { Run } from '../../../src/cli/agents/catalog.js';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the table is a constant
const claude = agents.find(agent => agent.id === 'claude-code')!;

const scripted = (...answers: { code: number | null; stderr: string }[]): { calls: string[][]; run: Run } => {
    const calls: string[][] = [];

    const run: Run = async (bin, args) => {
        calls.push([bin, ...args]);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- one answer per step
        return Promise.resolve(answers.shift()!);
    };

    return { calls, run };
};

describe('skills install: agents', () => {
    it('adds the marketplace, then installs the plugin from it', async () => {
        const { calls, run } = scripted({ code: 0, stderr: '' }, { code: 0, stderr: '' });

        expect(await install(claude, run)).to.deep.equal({ agent: 'claude-code', installed: true });

        expect(calls).to.deep.equal([
            ['claude', 'plugin', 'marketplace', 'add', 'adaptyteam/adapty-skills'],
            ['claude', 'plugin', 'install', 'adapty-skills@adapty'],
        ]);
    });

    it('installs when the marketplace was already added', async () => {
        const { run } = scripted({ code: 1, stderr: 'Marketplace already exists' }, { code: 0, stderr: '' });

        expect(await install(claude, run)).to.deep.equal({ agent: 'claude-code', installed: true });
    });

    it('reports the last lines the failing install wrote to stderr', async () => {
        const stderr = ['1', '2', '3', '4', '5', '6', 'Plugin not found'].join('\n');
        const { run } = scripted({ code: 0, stderr: '' }, { code: 1, stderr });

        expect(await install(claude, run)).to.deep.equal({
            agent: 'claude-code',
            error: '3\n4\n5\n6\nPlugin not found',
            installed: false,
        });
    });

    it('names the exit code when the install failed silently', async () => {
        const { run } = scripted({ code: 0, stderr: '' }, { code: 2, stderr: '' });

        expect((await install(claude, run)).error).to.equal('`claude` exited with code 2');
    });

    describe('onPath', () => {
        let dir: string;
        let path: string | undefined;

        beforeEach(async () => {
            dir = await mkdtemp(join(tmpdir(), 'adapty-skills-'));
            path = process.env.PATH;
            process.env.PATH = dir;
        });

        afterEach(async () => {
            process.env.PATH = path;
            await rm(dir, { force: true, recursive: true });
        });

        it('finds an executable in a PATH directory', async () => {
            await writeFile(join(dir, 'claude'), '');
            await chmod(join(dir, 'claude'), 0o755);

            expect(await onPath('claude')).to.equal(true);
        });

        it('does not find a file that is not executable, or no file at all', async () => {
            await writeFile(join(dir, 'codex'), '');

            expect(await onPath('codex')).to.equal(false);
            expect(await onPath('gemini')).to.equal(false);
        });
    });
});
