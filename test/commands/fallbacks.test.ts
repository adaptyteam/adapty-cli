import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import { assertFetch, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

const ROOT = join(import.meta.dirname, '..', '..');
const FIXTURE = await readFile(new URL('../fixtures/fallback-file.json', import.meta.url), 'utf8');
const FILE = JSON.parse(FIXTURE) as { meta: { developer_ids: string[] } };

const GET = `fallbacks get --app ${TEST_APP_ID} --platform ios --sdk-version 4.1.0`;

// eslint-disable-next-line no-control-regex -- the escape that starts an ANSI color sequence
const ANSI = /\u001B\[/;

type Step = {
    body: unknown;
    status?: number;
};

/** Answers each call with its own status; mockFetch's canned responses are all 200. */
const mockFetchSteps = (steps: Step[]): sinon.SinonStub => {
    let index = 0;

    return sinon.stub(globalThis, 'fetch').callsFake(() => {
        const step = steps[index] ?? steps.at(-1);
        index += 1;

        return Promise.resolve(new Response(JSON.stringify(step?.body), {
            headers: { 'content-type': 'application/json' },
            status: step?.status ?? 200,
        }));
    });
};

/**
 * A real child process with stdout on a pipe, the way CI runs `> file`: what the runner captures is
 * every byte the process writes there, not only what oclif's log() sends. A non-default API URL is
 * set on purpose, so its warning is printed and has to land on stderr. Like the migration selection
 * process test, the child runs the built CLI: `pnpm build` comes first.
 */
const SCRIPT = `
    import { execute } from '@oclif/core';
    globalThis.fetch = async () => new Response(process.env.FALLBACK_TEST_RESPONSE, {
        headers: { 'content-type': 'application/json' },
    });
    await execute({ args: JSON.parse(process.env.FALLBACK_TEST_ARGS), dir: process.cwd() });
`;

const runPiped = (args: string[]) => spawnSync(process.execPath, ['--input-type=module', '-e', SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
        ...process.env,
        ADAPTY_API_URL: 'https://stand.example.com/api/v1/developer',
        ADAPTY_TOKEN: 'piped-token',
        FALLBACK_TEST_ARGS: JSON.stringify(args),
        FALLBACK_TEST_RESPONSE: FIXTURE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
});

describe('fallbacks get', () => {
    let fetchStub: sinon.SinonStub | undefined;
    let dir: string;

    beforeEach(async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        dir = await mkdtemp(join(tmpdir(), 'adapty-fallbacks-'));
    });

    afterEach(async () => {
        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        delete process.env.ADAPTY_TOKEN;
        await rm(dir, { force: true, recursive: true });
    });

    describe('to stdout', () => {
        it('asks for the API platform name and the sdk version', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);

            await runCommand(GET);
            await runCommand(`fallbacks get --app ${TEST_APP_ID} --platform android --sdk-version 3.10.2`);

            assertFetch({
                callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/fallbacks/`,
                query: { platform: 'iOS', sdk_version: '4.1.0' }, stub: fetchStub,
            });

            assertFetch({
                callIndex: 1, method: 'GET', path: `/apps/${TEST_APP_ID}/fallbacks/`,
                query: { platform: 'Android', sdk_version: '3.10.2' }, stub: fetchStub,
            });
        });

        it('prints the file as one line of compact JSON in human mode', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);

            const { stdout } = await runCommand(GET);

            expect(stdout).to.equal(`${JSON.stringify(FILE)}\n`);
        });

        it('prints the same file under --json', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);

            const { stdout } = await runCommand(`${GET} --json`);

            expect(JSON.parse(stdout)).to.deep.equal(FILE);
        });

        for (const mode of [[], ['--json']]) {
            it(`writes only the file to a piped stdout${mode.length === 0 ? '' : ' under --json'}`, () => {
                const result = runPiped([...GET.split(' '), ...mode]);

                expect(result.status, result.stderr).to.equal(0);
                expect(result.stdout).to.not.match(ANSI);
                expect(JSON.parse(result.stdout)).to.deep.equal(FILE);
                // The URL warning went somewhere, and it was not stdout
                expect(result.stderr).to.contain('non-default API URL');
            });
        }
    });

    describe('with --output', () => {
        it('writes the compact file plus a newline, creating parent directories, and prints one line', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);
            const path = join(dir, 'Assets', 'StreamingAssets', 'ios_fallback.json');
            const content = `${JSON.stringify(FILE)}\n`;

            const { stdout } = await runCommand([...GET.split(' '), '--output', path]);

            expect(await readFile(path, 'utf8')).to.equal(content);

            expect(stdout).to.equal(
                `Wrote ios fallback to ${path} (meta version 11, 2 placements, ${Buffer.byteLength(content)} bytes)\n`,
            );
        });

        it('returns a summary under --json, with an absolute path', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);
            const content = `${JSON.stringify(FILE)}\n`;
            const cwd = process.cwd();

            process.chdir(dir);

            try {
                const { stdout } = await runCommand([...GET.split(' '), '--output', 'out/ios.json', '--json']);

                expect(JSON.parse(stdout)).to.deep.equal({
                    bytes: Buffer.byteLength(content),
                    meta_version: 11,
                    path: join(process.cwd(), 'out', 'ios.json'),
                    placements: FILE.meta.developer_ids.length,
                    platform: 'ios',
                    sdk_version: '4.1.0',
                });
            } finally {
                process.chdir(cwd);
            }
        });

        it('overwrites an existing file and leaves no temp file behind', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);
            const path = join(dir, 'ios_fallback.json');
            await writeFile(path, 'old');

            await runCommand([...GET.split(' '), '--output', path]);

            expect(JSON.parse(await readFile(path, 'utf8'))).to.deep.equal(FILE);
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('keeps the old file when the server fails', async () => {
            fetchStub = mockFetchSteps([{ body: { error_code: 'server_error' }, status: 500 }]);
            const path = join(dir, 'ios_fallback.json');
            await writeFile(path, 'old');

            const { error } = await runCommand([...GET.split(' '), '--output', path]);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(await readFile(path, 'utf8')).to.equal('old');
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('keeps the old file and creates no directory when the server cannot be reached', async () => {
            fetchStub = sinon.stub(globalThis, 'fetch').rejects(new TypeError('fetch failed'));
            const path = join(dir, 'ios_fallback.json');
            await writeFile(path, 'old');

            const { error } = await runCommand([...GET.split(' '), '--output', path]);
            const missing = await runCommand([...GET.split(' '), '--output', join(dir, 'new', 'ios.json')]);

            expect(error?.oclif?.exit).to.equal(exitCode.network);
            expect(missing.error?.oclif?.exit).to.equal(exitCode.network);
            expect(await readFile(path, 'utf8')).to.equal('old');
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('exits 1 with the errno when the file cannot be written', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);
            // A file where a parent directory should be
            await writeFile(join(dir, 'blocker'), 'x');

            const { error } = await runCommand([...GET.split(' '), '--output', join(dir, 'blocker', 'ios.json')]);

            expect(error?.oclif?.exit).to.equal(1);
            expect(error?.message).to.contain('Could not write the fallback file');
            expect(error?.message).to.match(/\((ENOTDIR|EEXIST)\)/);
        });
    });

    describe('input', () => {
        const bad = [
            `fallbacks get --app not-a-uuid --platform ios --sdk-version 4.1.0`,
            `fallbacks get --app ${TEST_APP_ID} --platform ios --sdk-version 4.1`,
            `fallbacks get --app ${TEST_APP_ID} --platform ios --sdk-version v4.1.0`,
            `fallbacks get --app ${TEST_APP_ID} --platform macos --sdk-version 4.1.0`,
            `fallbacks get --app ${TEST_APP_ID} --sdk-version 4.1.0`,
            `fallbacks get --app ${TEST_APP_ID} --platform ios`,
        ];

        it('exits 2 without a request for bad or missing flags', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);

            for (const command of bad) {
                const { error } = await runCommand(command);

                expect(error?.oclif?.exit, command).to.equal(exitCode.usage);
            }

            expect(fetchStub.callCount).to.equal(0);
        });

        it('reports a bad --sdk-version before the missing token', async () => {
            delete process.env.ADAPTY_TOKEN;
            fetchStub = mockFetchSteps([{ body: FILE }]);

            const { error } = await runCommand(`fallbacks get --app ${TEST_APP_ID} --platform ios --sdk-version 4`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('X.Y.Z');
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    describe('errors', () => {
        it('exits 3 without a request when there is no token', async () => {
            delete process.env.ADAPTY_TOKEN;
            fetchStub = mockFetchSteps([{ body: FILE }]);

            const { error } = await runCommand(GET);

            expect(error?.oclif?.exit).to.equal(exitCode.auth);
            expect(error?.message).to.contain('Not authenticated');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('exits 3 when the API refuses the token or the app', async () => {
            for (const code of ['authentication_failed', 'permission_denied']) {
                fetchStub = mockFetchSteps([{ body: { error_code: code, errors: [], status_code: 403 }, status: 403 }]);

                const { error } = await runCommand(GET);

                expect(error?.oclif?.exit, code).to.equal(exitCode.auth);
                restoreFetch(fetchStub);
                fetchStub = undefined;
            }
        });

        it('exits 4 on another API error, with the code under --json and nothing else on stdout', async () => {
            fetchStub = mockFetchSteps([{ body: { error_code: 'not_found', errors: [], status_code: 404 }, status: 404 }]);
            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stdout } = await runCommand(`${GET} --json`);
            const exit = process.exitCode;

            process.exitCode = 0;

            expect(exit).to.equal(exitCode.api);
            expect((JSON.parse(stdout) as { error: { code: string } }).error.code).to.equal('not_found');
            expect(fetchStub.callCount).to.equal(1);
        });

        it('exits 5 when the API cannot be reached', async () => {
            fetchStub = sinon.stub(globalThis, 'fetch').rejects(new TypeError('fetch failed'));

            const { error } = await runCommand(GET);

            expect(error?.oclif?.exit).to.equal(exitCode.network);
        });
    });
});
