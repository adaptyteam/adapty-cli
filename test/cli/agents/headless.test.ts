import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { CLAUDE_TOOLS, extractSummary, headlessArgs, runHeadless } from '../../../src/cli/agents/headless.js';

describe('agents: headless runs', () => {
    it('gives Claude Code only the tools the CLI ships with, and Codex a sandbox that keeps writes in the repository', () => {
        expect(headlessArgs('claude-code', 'PROMPT', '/tmp/last')).to.deep.equal([
            '-p', 'PROMPT', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', CLAUDE_TOOLS.join(','),
        ]);

        expect(CLAUDE_TOOLS).to.not.include('Bash');

        expect(headlessArgs('codex', 'PROMPT', '/tmp/last')).to.deep.equal([
            'exec', 'PROMPT', '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true',
            '--skip-git-repo-check', '--output-last-message', '/tmp/last',
        ]);
    });

    it('takes the last SUMMARY line of the final message, and none when there is no such line or it is empty', () => {
        expect(extractSummary('Done.\nSUMMARY: first\nmore\n  SUMMARY: swapped the SDK  ')).to.equal('swapped the SDK');
        expect(extractSummary('Done, nothing to summarize.')).to.equal(undefined);
        expect(extractSummary('SUMMARY:   ')).to.equal(undefined);
    });

    describe('runHeadless', () => {
        let dir: string;

        const stub = async (bin: string, script: string): Promise<void> => {
            await writeFile(join(dir, bin), `#!/bin/sh\n${script}\n`);
            await chmod(join(dir, bin), 0o755);
        };

        const run = async (agent: 'claude-code' | 'codex') => runHeadless({
            agent, cwd: dir, env: { PATH: `${dir}:/usr/bin:/bin` }, prompt: 'PROMPT', signal: new AbortController().signal,
        });

        beforeEach(async () => {
            dir = await mkdtemp(join(tmpdir(), 'adapty-headless-'));
        });

        afterEach(async () => {
            await rm(dir, { force: true, recursive: true });
        });

        it('reads Claude Code\'s last message from its JSON result', async () => {
            await stub('claude', 'printf \'%s\' \'{"type":"result","result":"Done.\\nSUMMARY: swapped the SDK"}\'');

            expect(await run('claude-code')).to.deep.equal({ code: 0, finalText: 'Done.\nSUMMARY: swapped the SDK', stderr: '' });
        });

        it('reads Codex\'s last message from the file it was told to write', async () => {
            // The file path is the last argument: --output-last-message PATH.
            await stub('codex', 'for last; do :; done; printf "SUMMARY: swapped the SDK" > "$last"');

            expect((await run('codex')).finalText).to.equal('SUMMARY: swapped the SDK');
        });

        it('hands back what the agent wrote to stderr when it fails', async () => {
            await stub('claude', 'echo "Failed to authenticate" >&2; exit 1');

            expect(await run('claude-code')).to.deep.equal({ code: 1, finalText: '', stderr: 'Failed to authenticate\n' });
        });
    });
});
