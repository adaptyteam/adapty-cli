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

/** The server's bytes: `17.0` and `", "` spacing, which a parse-and-rewrite would lose. */
const FILE = await readFile(new URL('../fixtures/fallback-file.json', import.meta.url));

const GET = ['fallbacks', 'get', '--app', TEST_APP_ID, '--platform', 'ios', '--sdk-version', '4.1.0'];

// eslint-disable-next-line no-control-regex -- the escape that starts an ANSI color sequence
const ANSI = /\u001B\[/;

const JSON_TYPE = { 'content-type': 'application/json' };

type Step = {
    /** Chunks of the body; `broken` ends it with a dropped connection instead of its end. */
    body: string | Uint8Array;
    broken?: boolean;
    headers?: Record<string, string>;
    status?: number;
};

/** Sends `head`, then breaks on the next read; error() drops queued chunks, so not both in start(). */
const breaking = (head: Uint8Array): ReadableStream<Uint8Array> => {
    let sent = false;

    return new ReadableStream({
        pull(controller) {
            if (sent) {
                controller.error(new TypeError('terminated'));
            } else {
                sent = true;
                controller.enqueue(head);
            }
        },
    });
};

/** Every call gets a fresh Response: a body is a stream, and a stream is read once. */
const mockFetchSteps = (steps: Step[]): sinon.SinonStub => {
    let index = 0;

    return sinon.stub(globalThis, 'fetch').callsFake(() => {
        const step = steps[index] ?? steps.at(-1);
        index += 1;

        if (step === undefined) {
            return Promise.reject(new Error('no step'));
        }

        const bytes = typeof step.body === 'string' ? new TextEncoder().encode(step.body) : step.body;

        const body = step.broken === true ? breaking(bytes.slice(0, Math.floor(bytes.length / 2))) : bytes;

        return Promise.resolve(new Response(body, {
            headers: { ...JSON_TYPE, ...step.headers },
            status: step.status ?? 200,
        }));
    });
};

const apiError = (code: string, status: number): Step => ({
    body: JSON.stringify({ error_code: code, errors: [] }),
    status,
});

/**
 * A real child process with stdout on a pipe, the way CI runs `> file`: what the runner captures is
 * every byte the process writes there, not only what oclif's log() sends. A non-default API URL is
 * set on purpose, so its warning is printed and has to land on stderr. Like the migration selection
 * process test, the child runs the built CLI: `pnpm build` comes first.
 *
 * FALLBACK_TEST_BODY: `file` sends the fixture, `broken` half of it and then a dropped connection,
 * `<N>mb` a generated file of N megabytes in 64 KiB chunks. The child reports its peak RSS on stderr.
 */
const SCRIPT = `
    import { readFileSync } from 'node:fs';
    import { execute } from '@oclif/core';
    const mode = process.env.FALLBACK_TEST_BODY;
    const file = readFileSync(process.env.FALLBACK_TEST_FIXTURE);
    const body = () => {
        if (mode === 'file') return file;
        // error() drops what is still queued, so the break comes on the read after the chunk
        let sent = false;
        if (mode === 'broken') return new ReadableStream({ pull(c) {
            if (sent) c.error(new TypeError('terminated'));
            else { sent = true; c.enqueue(file.subarray(0, 100)); }
        } });
        const chunk = new Uint8Array(64 * 1024).fill(0x61);
        let left = Number.parseInt(mode, 10) * 16;
        const enc = new TextEncoder();
        return new ReadableStream({
            start(c) { c.enqueue(enc.encode('{"data": "')); },
            pull(c) {
                if (left-- > 0) c.enqueue(chunk);
                else { c.enqueue(enc.encode('"}')); c.close(); }
            },
        });
    };
    globalThis.fetch = async () => new Response(body(), { headers: { 'content-type': 'application/json' } });
    process.on('exit', () => process.stderr.write('maxrss_kb=' + process.resourceUsage().maxRSS + '\\n'));
    await execute({ args: JSON.parse(process.env.FALLBACK_TEST_ARGS), dir: process.cwd() });
`;

const runPiped = (args: string[], body = 'file') => spawnSync(process.execPath, ['--input-type=module', '-e', SCRIPT], {
    cwd: ROOT,
    env: {
        ...process.env,
        ADAPTY_API_URL: 'https://stand.example.com/api/v1/developer',
        ADAPTY_TOKEN: 'piped-token',
        FALLBACK_TEST_ARGS: JSON.stringify(args),
        FALLBACK_TEST_BODY: body,
        FALLBACK_TEST_FIXTURE: new URL('../fixtures/fallback-file.json', import.meta.url).pathname,
    },
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
});

/** A body that records whether it was cancelled, and never ends unless it is. */
const watchedBody = (head: string) => {
    const state = { cancelled: false };
    let sent = false;

    const body = new ReadableStream<Uint8Array>({
        cancel() {
            state.cancelled = true;
        },
        pull(controller) {
            if (!sent) {
                sent = true;
                controller.enqueue(new TextEncoder().encode(head));
            }
        },
    });

    return { body, state };
};

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

        it('returns no result under --json, so oclif adds nothing after the file', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);

            const { result, stdout } = await runCommand([...GET, '--json']);

            expect(result).to.equal(undefined);
            expect(stdout).to.equal(FILE.toString('utf8'));
        });

        for (const mode of [[], ['--json']]) {
            it(`writes the server's bytes and nothing else to a piped stdout${mode.length === 0 ? '' : ' under --json'}`, () => {
                const result = runPiped([...GET, ...mode]);

                expect(result.status, result.stderr.toString()).to.equal(0);
                expect(result.stdout.equals(FILE)).to.equal(true);
                expect(result.stdout.toString('utf8')).to.not.match(ANSI);
                // The URL warning went somewhere, and it was not stdout
                expect(result.stderr.toString()).to.contain('non-default API URL');
            });
        }

        it('exits 5 when the body breaks halfway, and keeps the --json error off stdout once bytes went out', () => {
            const result = runPiped([...GET, '--json'], 'broken');

            expect(result.status).to.equal(exitCode.network);
            expect(result.stdout.equals(FILE.subarray(0, 100))).to.equal(true);
            expect(result.stderr.toString()).to.contain('"code": "network_error"');
        });

        it('exits 4 with fallback_invalid_response for a body that is not shaped {...}', async () => {
            fetchStub = mockFetchSteps([{ body: '  <html>maintenance</html>' }]);

            const { error, stdout } = await runCommand(GET);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.code).to.equal('fallback_invalid_response');
            expect(stdout).to.equal('');
        });

        it('exits 4 for an answer that is not JSON, before printing a byte', async () => {
            fetchStub = mockFetchSteps([{ body: FILE, headers: { 'content-type': 'text/html' } }]);

            const { error, stdout } = await runCommand(GET);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.code).to.equal('fallback_invalid_response');
            expect(stdout).to.equal('');
        });
    });

    describe('with --output', () => {
        it('writes the server\'s bytes, creating parent directories, and prints one line', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);
            const path = join(dir, 'Assets', 'StreamingAssets', 'ios_fallback.json');

            const { stdout } = await runCommand([...GET, '--output', path]);

            expect((await readFile(path)).equals(FILE)).to.equal(true);
            expect(stdout).to.equal(`Wrote ios fallback to ${path} (${FILE.length} bytes)\n`);
        });

        it('returns a summary under --json, with an absolute path', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);
            const cwd = process.cwd();

            process.chdir(dir);

            try {
                const { stdout } = await runCommand([...GET, '--output', 'out/ios.json', '--json']);

                expect(JSON.parse(stdout)).to.deep.equal({
                    bytes: FILE.length,
                    path: join(process.cwd(), 'out', 'ios.json'),
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

            await runCommand([...GET, '--output', path]);

            expect((await readFile(path)).equals(FILE)).to.equal(true);
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('downloads again when the body breaks halfway, and writes only the complete file', async () => {
            fetchStub = mockFetchSteps([{ body: FILE, broken: true }, { body: FILE }]);
            const path = join(dir, 'ios_fallback.json');
            await writeFile(path, 'old');

            const { error } = await runCommand([...GET, '--output', path]);

            expect(error).to.equal(undefined);
            expect(fetchStub.callCount).to.equal(2);
            expect((await readFile(path)).equals(FILE)).to.equal(true);
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('keeps the old file when every attempt breaks halfway', async () => {
            fetchStub = mockFetchSteps([{ body: FILE, broken: true }]);
            const path = join(dir, 'ios_fallback.json');
            await writeFile(path, 'old');

            const { error } = await runCommand([...GET, '--output', path]);

            expect(error?.oclif?.exit).to.equal(exitCode.network);
            expect(fetchStub.callCount).to.equal(3);
            expect(await readFile(path, 'utf8')).to.equal('old');
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('keeps the old file when the server fails', async () => {
            fetchStub = mockFetchSteps([apiError('server_error', 500)]);
            const path = join(dir, 'ios_fallback.json');
            await writeFile(path, 'old');

            const { error } = await runCommand([...GET, '--output', path]);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(await readFile(path, 'utf8')).to.equal('old');
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('keeps the old file and creates no directory when the server cannot be reached', async () => {
            fetchStub = sinon.stub(globalThis, 'fetch').rejects(new TypeError('fetch failed'));
            const path = join(dir, 'ios_fallback.json');
            await writeFile(path, 'old');

            const { error } = await runCommand([...GET, '--output', path]);
            const missing = await runCommand([...GET, '--output', join(dir, 'new', 'ios.json')]);

            expect(error?.oclif?.exit).to.equal(exitCode.network);
            expect(missing.error?.oclif?.exit).to.equal(exitCode.network);
            expect(await readFile(path, 'utf8')).to.equal('old');
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('keeps the old file for an answer that is not the file, without retrying it', async () => {
            const path = join(dir, 'ios_fallback.json');
            await writeFile(path, 'old');

            for (const step of [
                { body: FILE, headers: { 'content-type': 'text/html' } },
                { body: '{"truncated": ' },
                { body: '' },
            ]) {
                fetchStub = mockFetchSteps([step]);

                const { error } = await runCommand([...GET, '--output', path]);

                expect(error?.oclif?.exit).to.equal(exitCode.api);
                expect(error?.code).to.equal('fallback_invalid_response');
                expect(fetchStub.callCount).to.equal(1);
                restoreFetch(fetchStub);
                fetchStub = undefined;
            }

            expect(await readFile(path, 'utf8')).to.equal('old');
            expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        });

        it('exits 1 with the errno when the file cannot be written', async () => {
            fetchStub = mockFetchSteps([{ body: FILE }]);
            // A file where a parent directory should be
            await writeFile(join(dir, 'blocker'), 'x');

            const { error } = await runCommand([...GET, '--output', join(dir, 'blocker', 'ios.json')]);

            expect(error?.oclif?.exit).to.equal(1);
            expect(error?.code).to.equal('fallback_write_failed');
            expect(error?.message).to.match(/\((ENOTDIR|EEXIST)\)/);
            expect(fetchStub.callCount).to.equal(1);
        });

        it('keeps memory flat: a 200 MB body streams through with a peak RSS far below its size', () => {
            const path = join(dir, 'big.json');
            const result = runPiped([...GET, '--output', path], '200mb');
            const rss = Number(/maxrss_kb=(\d+)/.exec(result.stderr.toString())?.[1]) * 1024;

            expect(result.status, result.stderr.toString()).to.equal(0);
            // maxRSS is in kilobytes. The CLI alone peaks near 90 MiB; holding the 200 MiB body would
            // push the peak past 200 MiB
            expect(rss).to.be.greaterThan(0);
            expect(rss).to.be.lessThan(150 * 1024 * 1024);
        });
    });

    describe('a refused answer', () => {
        const cases = [
            { head: '{"data": ', name: 'not JSON', type: 'text/html' },
            { head: '<html>', name: 'not shaped {', type: 'application/json' },
        ];

        for (const { head, name, type } of cases) {
            for (const output of [false, true]) {
                it(`cancels the body when the answer is ${name}${output ? ', with --output' : ''}`, async () => {
                    const watched = watchedBody(head);

                    fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(watched.body, {
                        headers: { 'content-type': type },
                    }));

                    const args = output ? [...GET, '--output', join(dir, 'ios.json')] : GET;
                    const { error } = await runCommand(args);

                    expect(error?.code).to.equal('fallback_invalid_response');
                    expect(watched.state.cancelled).to.equal(true);
                    expect(await readdir(dir)).to.deep.equal([]);
                });
            }
        }
    });

    describe('input', () => {
        const bad = [
            'fallbacks get --app not-a-uuid --platform ios --sdk-version 4.1.0',
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
                fetchStub = mockFetchSteps([apiError(code, 403)]);

                const { error } = await runCommand(GET);

                expect(error?.oclif?.exit, code).to.equal(exitCode.auth);
                restoreFetch(fetchStub);
                fetchStub = undefined;
            }
        });

        it('exits 4 on another API error; without --output the --json error goes to stderr, stdout stays empty', async () => {
            fetchStub = mockFetchSteps([apiError('not_found', 404)]);
            // oclif keeps an exit code an earlier command left behind, so start from none
            process.exitCode = undefined;

            const { stderr, stdout } = await runCommand([...GET, '--json']);
            const exit = process.exitCode;

            process.exitCode = 0;

            expect(exit).to.equal(exitCode.api);
            expect(stdout).to.equal('');
            expect((JSON.parse(stderr) as { error: { code: string } }).error.code).to.equal('not_found');
            expect(fetchStub.callCount).to.equal(1);
        });

        it('keeps every --json error off stdout without --output: auth, network, a bad answer, bad flags', async () => {
            const cases: [string, () => sinon.SinonStub, string[]][] = [
                ['permission_denied', () => mockFetchSteps([apiError('permission_denied', 403)]), GET],
                ['network_error', () => sinon.stub(globalThis, 'fetch').rejects(new TypeError('fetch failed')), GET],
                ['fallback_invalid_response', () => mockFetchSteps([{ body: FILE, headers: { 'content-type': 'text/html' } }]), GET],
                ['', () => mockFetchSteps([{ body: FILE }]), [...GET.slice(0, -1), '4.1']],
            ];

            for (const [code, stub, args] of cases) {
                fetchStub = stub();
                process.exitCode = undefined;

                const { stderr, stdout } = await runCommand([...args, '--json']);

                process.exitCode = 0;

                expect(stdout, code).to.equal('');
                expect(stderr, code).to.contain('"error"');

                if (code !== '') {
                    expect((JSON.parse(stderr) as { error: { code: string } }).error.code, code).to.equal(code);
                }

                restoreFetch(fetchStub);
                fetchStub = undefined;
            }
        });

        it('keeps the --json error on stdout with --output, where stdout is not the file', async () => {
            fetchStub = mockFetchSteps([apiError('not_found', 404)]);
            process.exitCode = undefined;

            const { stdout } = await runCommand([...GET, '--output', join(dir, 'ios.json'), '--json']);

            process.exitCode = 0;

            expect((JSON.parse(stdout) as { error: { code: string } }).error.code).to.equal('not_found');
        });

        it('exits 5 when the API cannot be reached', async () => {
            fetchStub = sinon.stub(globalThis, 'fetch').rejects(new TypeError('fetch failed'));

            const { error } = await runCommand(GET);

            expect(error?.oclif?.exit).to.equal(exitCode.network);
        });
    });
});
