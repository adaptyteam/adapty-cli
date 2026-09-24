import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { expect } from 'chai';

import { createMigrationContext } from '../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../src/cli/context/migration/store.js';

const ROOT = join(import.meta.dirname, '..', '..');
const TOKEN = 'selection-process-token';

const ENVELOPE = JSON.parse(await fs.readFile(
    new URL('../fixtures/migration-envelope.json', import.meta.url), 'utf8',
)) as { migration: { id: string } };

const SCRIPT = `
    import { execute } from '@oclif/core';
    globalThis.fetch = async (url) => {
        if (!process.env.SELECTION_TEST_RESPONSE) throw new Error('Unexpected network request');
        if (process.env.SELECTION_TEST_PATH && !url.endsWith(process.env.SELECTION_TEST_PATH)) {
            throw new Error('Unexpected migration target: ' + url);
        }
        return new Response(process.env.SELECTION_TEST_RESPONSE, {
            headers: { 'content-type': 'application/json' },
        });
    };
    await execute({ args: JSON.parse(process.env.SELECTION_TEST_ARGS), dir: process.cwd() });
`;

const run = (args: string[], response?: string, path?: string) => spawnSync(process.execPath, [
    '--input-type=module', '-e', SCRIPT,
], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
        ...process.env,
        ADAPTY_TOKEN: TOKEN,
        SELECTION_TEST_ARGS: JSON.stringify(['migrations', ...args]),
        SELECTION_TEST_RESPONSE: response ?? '',
        SELECTION_TEST_PATH: path ?? '',
    },
    timeout: 10_000,
});

describe('migration selection across processes', () => {
    it('persists use, reads current offline in a new process, and clears with unuse', () => {
        const selected = run(['use', 'mig_requested', '--json'], JSON.stringify({ migration: { id: 'mig_returned' } }));

        expect(selected.status, selected.stderr).to.equal(0);
        expect(JSON.parse(selected.stdout)).to.deep.equal({ currentMigrationId: 'mig_returned' });

        const current = run(['current', '--json']);

        expect(current.status, current.stderr).to.equal(0);
        expect(JSON.parse(current.stdout)).to.deep.equal({ currentMigrationId: 'mig_returned', source: 'context' });

        const status = run(['status', '--json'], JSON.stringify(ENVELOPE), '/migrations/mig_returned');

        expect(status.status, status.stderr).to.equal(0);
        expect(JSON.parse(status.stdout)).to.deep.equal(ENVELOPE);

        const cleared = run(['unuse', '--json']);

        expect(cleared.status, cleared.stderr).to.equal(0);
        expect(JSON.parse(cleared.stdout)).to.deep.equal({ currentMigrationId: null });

        const after = run(['current', '--json']);

        expect(after.status, after.stderr).to.equal(0);
        expect(JSON.parse(after.stdout)).to.deep.equal({ currentMigrationId: null, source: null });
    });

    it('creates in a pipe and uses that selection in a new process', () => {
        const created = run(['create', '--name', 'App', '--json'], JSON.stringify(ENVELOPE), '/migrations');

        expect(created.status, created.stderr).to.equal(0);
        expect(JSON.parse(created.stdout)).to.deep.equal(ENVELOPE);

        const status = run(['status', '--json'], JSON.stringify(ENVELOPE), `/migrations/${ENVELOPE.migration.id}`);

        expect(status.status, status.stderr).to.equal(0);
        expect(JSON.parse(status.stdout)).to.deep.equal(ENVELOPE);
    });

    it('exits 0 with the unchanged creation envelope when saving context fails', async () => {
        const config = await Config.load(ROOT);
        const store = createMigrationContextStore(config.configDir);
        await fs.mkdir(store.path, { recursive: true });

        try {
            const child = run(['create', '--name', 'App', '--json'], JSON.stringify(ENVELOPE), '/migrations');

            expect(child.status, child.stderr).to.equal(0);
            expect(JSON.parse(child.stdout)).to.deep.equal(ENVELOPE);
            expect(child.stderr).to.contain(`adapty migrations status -m ${ENVELOPE.migration.id}`);
        } finally {
            await fs.rm(store.path, { recursive: true, force: true });
        }
    });

    for (const json of [false, true]) {
        it(`returns local context errors with exit 1 without leaking stored data (json=${json})`, async () => {
            const config = await Config.load(ROOT);
            const store = createMigrationContextStore(config.configDir);
            const context = createMigrationContext({ token: TOKEN }, 'mig_saved');
            await store.save(context);
            await fs.writeFile(store.path, `${JSON.stringify(context)} ${TOKEN}`);

            const child = run(['current', ...(json ? ['--json'] : [])]);

            expect(child.status, child.stderr || child.stdout).to.equal(1);
            expect(child.stdout + child.stderr).not.to.contain(TOKEN);
            expect(child.stdout + child.stderr).not.to.contain(context.tokenFingerprint);

            if (json) {
                const output = JSON.parse(child.stdout) as { error: { code: string; message: string } };
                expect(output.error.code).to.equal('migration_context_invalid');
                expect(output.error.message).to.contain('migrations unuse');
            } else {
                expect(child.stdout).to.equal('');
                expect(child.stderr).to.contain('Invalid migration context');
            }
        });

        it(`returns usage exit 2 for a blank use argument (json=${json})`, () => {
            const child = run(['use', '   ', ...(json ? ['--json'] : [])]);

            expect(child.status, child.stderr || child.stdout).to.equal(2);

            if (json) {
                const output = JSON.parse(child.stdout) as { error: { code: string } };
                expect(output.error.code).to.equal('migration_required');
            } else {
                expect(child.stderr).to.contain('empty or whitespace');
            }
        });
    }
});
