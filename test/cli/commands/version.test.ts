import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { EXIT_GRACE_MS, isNewer, isSemver, LATEST_URL, TIME_LIMIT_MS, UNKNOWN_LATEST } from '../../../src/cli/commands/version.js';
import { exitCode } from '../../../src/cli/errors.js';
import {
    EMPTY_LIST_RESPONSE,
    mockFetch,
    mockFetchSteps,
    requestOf,
} from '../../helpers/mock-fetch.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const REGISTRY_HOST = 'registry.npmjs.org';

const UPDATE_LINE = (latest: string): string => `A new version of adapty is available: ${latest}. Update: npm i -g adapty@latest`;

/** The CLI as if `installed` were the version in package.json; the --version line follows it. */
const installedAs = async (installed: string): Promise<Config> => {
    const config = await Config.load(ROOT);

    config.version = installed;
    config.userAgent = `${config.name}/${installed} ${config.platform}-${config.arch} node-${process.version}`;

    return config;
};

const registryCalls = (stub: sinon.SinonStub): number =>
    stub.getCalls().filter(call => String(call.args[0]).includes(REGISTRY_HOST)).length;

/** Every file under a folder, relative to it; nothing when the folder does not exist. */
const filesUnder = async (dir: string): Promise<string[]> => {
    try {
        return (await readdir(dir, { recursive: true })).sort();
    } catch {
        return [];
    }
};

/** A host that cannot be reached: fetch rejects and no response comes. */
const mockFetchRejects = (): sinon.SinonStub => sinon.stub(globalThis, 'fetch').rejects(new TypeError('fetch failed'));

/** A host that takes the request and never answers: the call ends only when its signal aborts. */
const mockFetchHangs = (): sinon.SinonStub => sinon.stub(globalThis, 'fetch').callsFake(async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('This operation was aborted', 'AbortError'));
        }, { once: true });
    }));

describe('version', () => {
    let fetchStub: sinon.SinonStub | undefined;

    /**
     * The command ends a process that a cut-off read still holds open. Here that process is mocha: a real
     * exit would end the run with code 0 and skip the rest. The exit is armed on a timer that fires after
     * the run, so one stub covers the whole group, in its own sandbox that outlives each test's restore:
     * a late exit lands on the next test, or on the check after the last one.
     */
    const exitSandbox = sinon.createSandbox();
    let exitStub: sinon.SinonStub;
    let expectedExits: unknown[];

    const exitsSoFar = (): unknown[] => exitStub.getCalls().map(call => call.args[0] as unknown);

    before(() => {
        exitStub = exitSandbox.stub(process, 'exit');
    });

    after(async () => {
        // Real time: every test has restored its fake clock by now. Twice the grace covers the flush too
        await new Promise((resolve) => {
            setTimeout(resolve, 2 * EXIT_GRACE_MS);
        });

        const late = exitsSoFar();

        exitSandbox.restore();

        expect(late, 'the codes the command ended the process with after the last test').to.deep.equal([]);
    });

    beforeEach(() => {
        expectedExits = [];
    });

    afterEach(() => {
        const exits = exitsSoFar();

        exitStub.resetHistory();
        fetchStub?.restore();
        fetchStub = undefined;
        sinon.restore();

        expect(exits, 'the codes the command ended the process with').to.deep.equal(expectedExits);
    });

    describe('human output', () => {
        it('prints the --version line, then the update line when npm has a newer version', async () => {
            const config = await installedAs('0.24.0');

            fetchStub = mockFetch([{ name: 'adapty', version: '0.24.1' }]);

            const { error, stderr, stdout } = await runCommand('version', config);

            expect(error).to.equal(undefined);
            expect(stdout).to.equal(`${config.userAgent}\n${UPDATE_LINE('0.24.1')}\n`);
            expect(stdout.split('\n')[0]).to.match(/^adapty\/0\.24\.0 \S+-\S+ node-v\d/);
            expect(stderr).to.equal('');
        });

        it('prints only the --version line when the installed version is the latest', async () => {
            const config = await installedAs('0.24.0');

            fetchStub = mockFetch([{ version: '0.24.0' }]);

            const { error, stderr, stdout } = await runCommand('version', config);

            expect(error).to.equal(undefined);
            expect(stdout).to.equal(`${config.userAgent}\n`);
            expect(stderr).to.equal('');
        });

        it('prints the --version line, and says on stderr that it could not check, when the read fails', async () => {
            const config = await installedAs('0.24.0');

            fetchStub = mockFetchRejects();

            const { error, stderr, stdout } = await runCommand('version', config);

            expect(error).to.equal(undefined);
            expect(stdout).to.equal(`${config.userAgent}\n`);
            expect(stderr).to.equal(`${UNKNOWN_LATEST}\n`);
            expect(UNKNOWN_LATEST).to.equal('Could not check for a newer version.');
        });
    });

    describe('--json', () => {
        it('gives exactly installed, latest and update_available', async () => {
            fetchStub = mockFetch([{ version: '0.24.1' }]);

            const { error, stderr, stdout } = await runCommand('version --json', await installedAs('0.24.0'));

            expect(error).to.equal(undefined);
            expect(JSON.parse(stdout)).to.deep.equal({ installed: '0.24.0', latest: '0.24.1', update_available: true });
            expect(stderr).to.equal('');
        });

        /** Semver order, not text order: a prerelease is older than its release, 0.10.0 is newer than 0.9.0. */
        const table: [installed: string, latest: string, updateAvailable: boolean][] = [
            ['0.24.0', '0.24.1', true],
            ['0.24.1', '0.24.1', false],
            ['0.25.0-beta.1', '0.24.1', false],
            ['0.24.1-beta.1', '0.24.1', true],
            ['0.10.0', '0.9.0', false],
        ];

        for (const [installed, latest, updateAvailable] of table) {
            it(`installed ${installed}, latest ${latest}: update_available ${String(updateAvailable)}`, async () => {
                fetchStub = mockFetch([{ version: latest }]);

                const { stdout } = await runCommand('version --json', await installedAs(installed));

                expect(JSON.parse(stdout)).to.deep.equal({ installed, latest, update_available: updateAvailable });
            });
        }
    });

    describe('when the registry cannot say', () => {
        const failures: [name: string, stub: () => sinon.SinonStub][] = [
            ['a network error', () => mockFetchRejects()],
            ['HTTP 500', () => mockFetchSteps([{ body: { error: 'Internal Server Error' }, status: 500 }])],
            ['a body that is not JSON', () => sinon.stub(globalThis, 'fetch').resolves(new Response('<html>busy</html>', { status: 200 }))],
            ['no version field', () => mockFetch([{ name: 'adapty' }])],
            ['a version that is not semver', () => mockFetch([{ version: 'latest' }])],
        ];

        for (const [name, stub] of failures) {
            it(`${name}: latest null, update_available false, empty stderr, exit 0`, async () => {
                fetchStub = stub();

                const { error, stderr, stdout } = await runCommand('version --json', await installedAs('0.24.0'));

                expect(error).to.equal(undefined);
                expect(JSON.parse(stdout)).to.deep.equal({ installed: '0.24.0', latest: null, update_available: false });
                expect(stderr).to.equal('');
            });
        }

        it(`no answer: the read is aborted at ${TIME_LIMIT_MS} ms, then latest null`, async () => {
            const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

            fetchStub = mockFetchHangs();

            const running = runCommand('version --json', await installedAs('0.24.0'));

            while (!fetchStub.called) {
                await nextTurn();
            }

            const init = fetchStub.getCall(0).args[1] as RequestInit;

            await clock.tickAsync(TIME_LIMIT_MS - 1);
            expect(init.signal?.aborted).to.equal(false);

            await clock.tickAsync(1);
            expect(init.signal?.aborted).to.equal(true);

            const { error, stderr, stdout } = await running;

            expect(TIME_LIMIT_MS).to.equal(3000);
            expect(error).to.equal(undefined);
            expect(JSON.parse(stdout)).to.deep.equal({ installed: '0.24.0', latest: null, update_available: false });
            expect(stderr).to.equal('');
            expect(exitStub.called).to.equal(false);

            // The cut-off read may still hold the process: after the grace, it ends with 0 once the output is written
            await clock.tickAsync(EXIT_GRACE_MS);

            for (let turn = 0; turn < 1000 && !exitStub.called; turn++) {
                await nextTurn();
            }

            expect(exitStub.getCalls().map(call => call.args[0] as unknown)).to.deep.equal([0]);
            expectedExits = [0];
        });
    });

    describe('Ctrl+C', () => {
        it('during a read that hangs: exit 130, the --version line only and no notice', async () => {
            const config = await installedAs('0.24.0');

            fetchStub = mockFetchHangs();

            const running = runCommand('version', config);

            while (!fetchStub.called) {
                await nextTurn();
            }

            process.emit('SIGINT', 'SIGINT');

            const { error, stderr, stdout } = await running;

            expect(error?.oclif?.exit).to.equal(exitCode.cancelled);
            expect(exitCode.cancelled).to.equal(130);
            expect(stdout).to.equal(`${config.userAgent}\n`);
            expect(stderr).to.not.contain(UNKNOWN_LATEST);
        });
    });

    it('reads the registry on each run and writes no file', async () => {
        const config = await installedAs('0.24.0');
        const folders = [config.configDir, config.cacheDir, config.dataDir];
        const snapshot = async (): Promise<string[][]> => Promise.all(folders.map(filesUnder));
        const before = await snapshot();

        fetchStub = mockFetch([{ version: '0.24.1' }]);

        await runCommand('version', config);
        await runCommand('version', config);

        expect(fetchStub.callCount).to.equal(2);
        expect(registryCalls(fetchStub)).to.equal(2);
        expect(await snapshot()).to.deep.equal(before);
    });

    describe('the registry', () => {
        const original = process.env.npm_config_registry;

        afterEach(() => {
            if (original === undefined) {
                delete process.env.npm_config_registry;
            } else {
                process.env.npm_config_registry = original;
            }
        });

        it('is always the public one, also when the npm settings name another', async () => {
            process.env.npm_config_registry = 'https://registry.example.com/';
            fetchStub = mockFetch([{ version: '0.24.1' }]);

            await runCommand('version --json', await installedAs('0.24.0'));

            expect(fetchStub.callCount).to.equal(1);
            expect(requestOf(fetchStub, 0).url).to.equal('https://registry.npmjs.org/adapty/latest');
            expect(LATEST_URL).to.equal('https://registry.npmjs.org/adapty/latest');
        });
    });

    describe('other commands', () => {
        it('--version prints only the version line and asks no registry', async () => {
            const config = await Config.load(ROOT);

            fetchStub = mockFetch([{ version: '99.0.0' }]);

            const { error, stderr, stdout } = await runCommand('--version', config);

            expect(error).to.equal(undefined);
            expect(stdout).to.equal(`adapty/${config.version} ${config.platform}-${config.arch} node-${process.version}\n`);
            expect(stderr).to.equal('');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('apps list --json asks no registry and prints the API answer as before', async () => {
            process.env.ADAPTY_TOKEN = 'test-token';
            fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);

            const { error, stderr, stdout } = await runCommand('apps list --json');

            expect(error).to.equal(undefined);
            expect(JSON.parse(stdout)).to.deep.equal(EMPTY_LIST_RESPONSE);
            expect(stderr).to.equal('');
            expect(fetchStub.callCount).to.equal(1);
            expect(registryCalls(fetchStub)).to.equal(0);
        });
    });
});

describe('version: isNewer', () => {
    const rows: [latest: string, installed: string, newer: boolean][] = [
        ['0.24.1', '0.24.0', true],
        ['0.24.0', '0.24.1', false],
        ['0.24.1', '0.24.1', false],
        ['0.10.0', '0.9.0', true],
        ['0.9.0', '0.10.0', false],
        ['1.0.0', '0.99.99', true],
        ['0.24.1', '0.24.1-beta.1', true],
        ['0.24.1-beta.1', '0.24.1', false],
        ['0.24.1', '0.25.0-beta.1', false],
        ['1.0.0-alpha.1', '1.0.0-alpha', true],
        ['1.0.0-alpha.beta', '1.0.0-alpha.1', true],
        ['1.0.0-beta.11', '1.0.0-beta.2', true],
        ['1.0.0-rc.1', '1.0.0-beta.11', true],
        ['1.0.0+build.2', '1.0.0+build.1', false],
        ['latest', '0.24.0', false],
        ['0.24.1', 'not-a-version', false],
    ];

    for (const [latest, installed, newer] of rows) {
        it(`${latest} is ${newer ? '' : 'not '}newer than ${installed}`, () => {
            expect(isNewer(latest, installed)).to.equal(newer);
        });
    }
});

describe('version: isSemver', () => {
    it('takes the versions npm publishes and refuses the rest', () => {
        expect(['0.24.0', '1.0.0-beta.1', '1.0.0+sha.5114f85', '10.20.30'].map(isSemver)).to.deep.equal([true, true, true, true]);
        expect(['', 'v1.0.0', '1.0', '01.0.0', '1.0.0-01', 'latest', ' 1.0.0'].map(isSemver)).to.deep.equal([false, false, false, false, false, false, false]);
    });
});
