import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { expect } from 'chai';

import { createMigrationContextStore } from '../../../src/cli/context/migration/store.js';
import { createFileSessionStore } from '../../../src/sdk/core/session.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const TOKEN = 'cleanup-secret-token';

const SCRIPT = `
    import { execute } from '@oclif/core';
    let requests = 0;
    globalThis.fetch = async () => {
        if (process.env.CLEANUP_COMMAND !== 'revoke' || ++requests > 1) {
            throw new Error('Unexpected auth request');
        }
        return new Response('{}');
    };
    await execute({ args: JSON.parse(process.env.CLEANUP_ARGS), dir: process.cwd() });
`;

describe('auth cleanup process errors', () => {
    for (const command of ['logout', 'revoke']) {
        for (const json of [false, true]) {
            it(`${command} returns local exit 1 after attempting both files (json=${json})`, async () => {
                const config = await Config.load(ROOT);
                const session = createFileSessionStore(config.configDir);
                const context = createMigrationContextStore(config.configDir);
                await session.save({ token: TOKEN });
                await fs.mkdir(context.path);

                try {
                    const child = spawnSync(process.execPath, ['--input-type=module', '-e', SCRIPT], {
                        cwd: ROOT,
                        encoding: 'utf8',
                        env: {
                            ...process.env,
                            ADAPTY_TOKEN: TOKEN,
                            CLEANUP_COMMAND: command,
                            CLEANUP_ARGS: JSON.stringify(['auth', command, ...(json ? ['--json'] : [])]),
                        },
                        timeout: 10_000,
                    });

                    expect(child.error).to.equal(undefined);
                    expect(child.status, child.stderr || child.stdout).to.equal(1);
                    expect(await session.load()).to.equal(undefined);
                    expect(child.stdout + child.stderr).not.to.contain(TOKEN);

                    if (json) {
                        const output = JSON.parse(child.stdout) as { error: { code: string; message: string } };
                        expect(output.error.code).to.equal('auth_cleanup_failed');
                        expect(output.error.message).to.contain('cleanup is incomplete');
                    } else {
                        expect(child.stdout).to.equal('');
                        expect(child.stderr).to.contain('cleanup is incomplete');
                    }

                    if (command === 'revoke') {
                        expect(child.stdout + child.stderr).to.contain('Token revoked on the server');
                    }
                } finally {
                    await fs.rm(context.path, { recursive: true, force: true });
                }
            });
        }
    }
});
