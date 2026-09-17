import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { expect } from 'chai';

const ROOT = join(import.meta.dirname, '..', '..');

const cases = [
    { args: ['status'], message: 'No migration selected', name: 'missing migration ID' },
    { args: ['run', '-m', 'mig_test'], message: 'action_id', name: 'missing action argument' },
    {
        args: ['create', '--name', 'My app', '--flow', 'transactions', '--app', 'app_test'],
        message: 'cannot also be provided',
        name: 'conflicting flags',
    },
    { args: ['status', '-m', 'mig_test', '--unknown'], message: 'Nonexistent flag', name: 'unknown flag' },
    {
        args: ['status', '-m', 'mig_test', '--wait', '--timeout', '900s'],
        message: 'Invalid duration',
        name: 'invalid timeout',
    },
    {
        args: ['status', '-m', 'mig_test', '--timeout', '5m'],
        message: '--wait',
        name: 'missing dependent flag',
    },
    {
        args: ['close', '-m', 'mig_test', '--outcome', 'finish'],
        message: 'Missing required flag yes',
        name: 'missing closure confirmation flag',
    },
    { args: ['create'], message: 'Invalid input', name: 'SDK input validation' },
];

describe('migration process exit codes', () => {
    it('returns auth exit 3 for HTTP 403 and preserves server diagnostics in human and JSON modes', () => {
        const serverError = {
            code: 'forbidden',
            detail: 'This user cannot access the migration.',
            fields: [],
            message: 'Access denied',
            next_step: 'Ask the company owner to grant access.',
            request_id: 'req_forbidden',
            retry_after_seconds: null,
            retryable: false,
        };

        const script = `
            import { execute } from '@oclif/core';
            const body = JSON.parse(process.env.MIGRATION_TEST_ERROR);
            let requests = 0;
            globalThis.fetch = async () => {
                if (++requests > 1) throw new Error('Unexpected retry of HTTP 403');
                return new Response(JSON.stringify(body), {
                    status: 403, headers: { 'content-type': 'application/json' },
                });
            };
            await execute({ args: JSON.parse(process.env.MIGRATION_TEST_ARGS), dir: process.cwd() });
        `;

        for (const json of [false, true]) {
            const args = ['migrations', 'status', '-m', 'mig_test', ...(json ? ['--json'] : [])];

            const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
                cwd: ROOT,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    ADAPTY_TOKEN: 'test-token',
                    MIGRATION_TEST_ARGS: JSON.stringify(args),
                    MIGRATION_TEST_ERROR: JSON.stringify({ error: serverError }),
                },
                timeout: 10_000,
            });

            expect(child.error).to.equal(undefined);
            expect(child.status, child.stderr || child.stdout).to.equal(3);

            if (json) {
                expect(JSON.parse(child.stdout)).to.deep.equal({ error: {
                    ...serverError, error_code: 'forbidden', status: 403, status_code: 403,
                } });
            } else {
                expect(child.stdout).to.equal('');
                expect(child.stderr).to.contain(serverError.message);
                expect(child.stderr).to.contain(serverError.detail);
                expect(child.stderr).to.contain(serverError.next_step);
                expect(child.stderr).to.contain(serverError.request_id);
            }
        }
    });

    // Each invocation needs its own process: oclif catches JSON errors without rethrowing them.
    for (const { args, message, name } of cases) {
        it(`returns usage exit 2 in human and JSON modes for ${name}`, () => {
            const env = { ...process.env };

            delete env.ADAPTY_MIGRATION;
            delete env.ADAPTY_TOKEN;
            delete env.CONTENT_TYPE;

            for (const json of [false, true]) {
                const child = spawnSync(process.execPath, [
                    join(ROOT, 'bin/run.js'), 'migrations', ...args, ...(json ? ['--json'] : []),
                ], { cwd: ROOT, encoding: 'utf8', env, timeout: 10_000 });

                expect(child.error).to.equal(undefined);
                expect(child.status, child.stderr || child.stdout).to.equal(2);

                if (json) {
                    const output = JSON.parse(child.stdout) as { error: { message: string } };

                    expect(output.error.message).to.contain(message);

                    if (name === 'missing migration ID') {
                        expect(output.error).to.include({ code: 'migration_required' });
                    } else {
                        expect(output.error).to.have.all.keys('message');
                    }
                } else {
                    expect(child.stdout).to.equal('');
                    expect(child.stderr).to.contain(message);
                }
            }
        });
    }
});
