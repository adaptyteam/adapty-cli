import { join } from 'node:path';

import { Config, Flags } from '@oclif/core';
import { captureOutput } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { AdaptyCommand } from '../../src/cli/base/adapty/index.js';
import { BaseCommand } from '../../src/cli/base/base-command.js';
import { exitCode } from '../../src/cli/errors.js';
import { throwIfAborted } from '../../src/sdk/core/clock.js';
import { AuthRequiredError, CancelledError, isSdkError, NetworkError, ValidationError } from '../../src/sdk/core/errors.js';
import { createFileSessionStore } from '../../src/sdk/core/session.js';

import type { AuthenticatedSession } from '../../src/cli/base/adapty/index.js';

const ROOT = join(import.meta.dirname, '..', '..');

/** Stands in for a resource command: parses flags first, then talks to the sdk. */
class TokenProbe extends AdaptyCommand {
    static override flags = { page: Flags.integer() };

    async run(): Promise<{ token: string }> {
        await this.parse(TokenProbe);

        return { token: this.session.token };
    }
}

class MeProbe extends AdaptyCommand {
    async run(): Promise<Record<string, unknown>> {
        await this.parse(MeProbe);

        return this.adapty.auth.me();
    }
}

/** Reaches for the session without the lifecycle, the way a refactor eventually will. */
class PeekProbe extends AdaptyCommand {
    peek(): AuthenticatedSession {
        return this.session;
    }

    async run(): Promise<void> {
        await this.parse(PeekProbe);
    }
}

class CancelProbe extends BaseCommand {
    async run(): Promise<void> {
        await this.parse(CancelProbe);
        process.emit('SIGINT', 'SIGINT');
        throwIfAborted(this.signal);
    }
}

class ListenerProbe extends BaseCommand {
    async run(): Promise<number> {
        await this.parse(ListenerProbe);

        return process.listenerCount('SIGINT');
    }
}

class ErrorProbe extends BaseCommand {
    static failure: Error;

    async run(): Promise<void> {
        await this.parse(ErrorProbe);
        throw ErrorProbe.failure;
    }
}

let viewCalls = 0;

class RenderProbe extends BaseCommand {
    async run(): Promise<{ ok: boolean }> {
        await this.parse(RenderProbe);

        this.render({ ok: true }, (value) => {
            viewCalls += 1;

            return `rendered ok=${String(value.ok)}`;
        });

        return { ok: true };
    }
}

const requestHeaders = (stub: sinon.SinonStub, callIndex: number): Headers => {
    const init = stub.getCall(callIndex).args[1] as RequestInit;

    return init.headers as Headers;
};

describe('cli base commands', () => {
    let config: Config;

    before(async () => {
        config = await Config.load(ROOT);
    });

    beforeEach(async () => {
        delete process.env.ADAPTY_TOKEN;
        delete process.env.ADAPTY_API_URL;
        await createFileSessionStore(config.configDir).clear();
    });

    it('keeps an own static on the intermediate authenticated base for oclif manifest caching', () => {
        expect(Object.hasOwn(AdaptyCommand, 'enableJsonFlag')).to.equal(true);
    });

    it('turns a missing token into exit 3 and the login hint', async () => {
        const { error } = await captureOutput(async () => TokenProbe.run([], config));

        expect(error?.message).to.contain('adapty auth login');
        expect(error?.oclif?.exit).to.equal(exitCode.auth);
    });

    it('includes the login hint in JSON when there is no token', async () => {
        const { stdout } = await captureOutput(async () => TokenProbe.run(['--json'], config));

        expect(JSON.parse(stdout)).to.deep.equal({
            error: { code: 'auth_required', message: 'Not authenticated. Run `adapty auth login`.' },
        });
    });

    it('serializes parser errors as a message without the parser context', async () => {
        const { stdout } = await captureOutput(async () => TokenProbe.run(['--pge', '2', '--json'], config));
        const result = JSON.parse(stdout) as { error: { message: string } };

        expect(result.error.message).to.contain('Nonexistent flag');
        expect(result.error).to.have.all.keys('message');
    });

    it('keeps SDK and unexpected error explanations in JSON', async () => {
        const cases = [
            {
                error: new ValidationError([{ message: 'is required', path: 'appleBundleId' }]),
                expected: { message: 'Invalid input:\n  --apple-bundle-id: is required' },
            },
            {
                error: new AuthRequiredError('rejected'),
                expected: {
                    code: 'auth_required',
                    message: 'Token expired or invalid. Run `adapty auth login`.',
                    status: 401,
                },
            },
            {
                error: new NetworkError('https://api.example.com/me/', new TypeError('fetch failed')),
                expected: {
                    code: 'network_error',
                    error_code: 'network_error',
                    errors: { connection: ['fetch failed'] },
                    message: 'Could not reach https://api.example.com/me/. Check the connection and try again.',
                    status: 0,
                    status_code: 0,
                },
            },
            { error: new CancelledError(), expected: { message: 'Cancelled.' } },
            { error: new TypeError('Unexpected failure'), expected: { message: 'Unexpected failure' } },
        ];

        for (const { error, expected } of cases) {
            ErrorProbe.failure = error;

            const { stdout } = await captureOutput(async () => ErrorProbe.run(['--json'], config));

            expect(JSON.parse(stdout), error.constructor.name).to.deep.equal({ error: expected });
        }
    });

    it('reports a wrong flag before a missing token: input errors come before state errors', async () => {
        const { error } = await captureOutput(async () => TokenProbe.run(['--pge', '2'], config));

        expect(error?.message).to.contain('Nonexistent flag');
        expect(error?.message).to.not.contain('auth login');
    });

    it('fails a broken invariant as a bare Error, with no kind and no friendly exit code', () => {
        const probe = new PeekProbe([], config);

        expect(() => probe.peek()).to.throw('only after init');

        try {
            probe.peek();
        } catch (error) {
            expect(isSdkError(error)).to.equal(false);
        }
    });

    it('carries the resolved token into the request under our own User-Agent', async () => {
        await createFileSessionStore(config.configDir).save({ token: 'stored-token' });

        const stub = sinon.stub(globalThis, 'fetch').resolves(
            new Response('{"email":"dev@example.com"}', { headers: { 'content-type': 'application/json' }, status: 200 }),
        );

        try {
            const { result } = await captureOutput<Record<string, unknown>>(async () => MeProbe.run([], config));
            const headers = requestHeaders(stub, 0);

            expect(result).to.deep.equal({ email: 'dev@example.com' });
            expect(stub.getCall(0).args[0]).to.equal(`https://api-admin.adapty.io/api/v1/developer/me/`);
            expect(headers.get('authorization')).to.equal('Bearer stored-token');
            // oclif's own config.userAgent would read `adapty/<version> darwin-arm64 …`
            expect(headers.get('user-agent')).to.contain(`adapty-cli/${config.version}`);
        } finally {
            stub.restore();
        }
    });

    it('turns Ctrl+C into an abort and exit 130 instead of a silent success', async () => {
        const { error } = await captureOutput(async () => CancelProbe.run([], config));

        expect(error?.message).to.contain('Cancelled');
        expect(error?.oclif?.exit).to.equal(exitCode.cancelled);
    });

    it('adds exactly one SIGINT listener and takes it back off', async () => {
        const before = process.listenerCount('SIGINT');
        const { result } = await captureOutput<number>(async () => ListenerProbe.run([], config));

        expect(result).to.equal(before + 1);
        expect(process.listenerCount('SIGINT')).to.equal(before);
    });

    it('renders for humans and skips the view under --json, where oclif prints the return value', async () => {
        viewCalls = 0;

        const human = await captureOutput(async () => RenderProbe.run([], config));

        expect(human.stdout).to.contain('rendered ok=true');
        expect(viewCalls).to.equal(1);

        const json = await captureOutput(async () => RenderProbe.run(['--json'], config));

        // this.log is already silent under --json, so the guard is checked where it shows: the
        // view is never built, and only the returned value is printed
        expect(viewCalls).to.equal(1);
        expect(json.stdout).to.not.contain('rendered');
        expect(JSON.parse(json.stdout)).to.deep.equal({ ok: true });
    });

    it('shows an sdk retry as a warning naming the attempt about to be made', async () => {
        process.env.ADAPTY_TOKEN = 'env-token';

        const stub = sinon.stub(globalThis, 'fetch');
        stub.onFirstCall().rejects(new TypeError('fetch failed'));
        stub.onSecondCall().resolves(new Response('{}', { headers: { 'content-type': 'application/json' }, status: 200 }));

        try {
            const { stderr } = await captureOutput(async () => MeProbe.run([], config));

            expect(stderr).to.contain('retrying in 0.5s (attempt 2)');
            expect(stub.callCount).to.equal(2);
        } finally {
            stub.restore();
        }
    });

    it('warns once about a non-default API URL, and says nothing about the default one', async () => {
        process.env.ADAPTY_TOKEN = 'env-token';
        process.env.ADAPTY_API_URL = 'https://staging.example.com/api';

        const redirected = await captureOutput(async () => TokenProbe.run([], config));

        expect(redirected.stderr).to.equal('Warning: Using non-default API URL: https://staging.example.com/api\n');

        delete process.env.ADAPTY_API_URL;

        const plain = await captureOutput(async () => TokenProbe.run([], config));

        expect(plain.stderr).to.not.contain('non-default API URL');
    });

    it('warns about a non-default API URL under --json without polluting stdout', async () => {
        process.env.ADAPTY_TOKEN = 'env-token';
        process.env.ADAPTY_API_URL = 'https://staging.example.com/api';

        const redirected = await captureOutput(async () => TokenProbe.run(['--json'], config));

        expect(redirected.stderr).to.equal('Warning: Using non-default API URL: https://staging.example.com/api\n');
        expect(JSON.parse(redirected.stdout)).to.deep.equal({ token: 'env-token' });

        delete process.env.ADAPTY_API_URL;

        const plain = await captureOutput(async () => TokenProbe.run(['--json'], config));

        expect(plain.stderr).to.equal('');
        expect(JSON.parse(plain.stdout)).to.deep.equal({ token: 'env-token' });
    });

    it('turns Ctrl+C while reading a response body into exit 130', async () => {
        process.env.ADAPTY_TOKEN = 'env-token';

        const stub = sinon.stub(globalThis, 'fetch').callsFake(() => Promise.resolve(new Response(
            // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Web streams exist in Node 22; only their stability label changed later.
            new ReadableStream({
                pull(controller) {
                    process.emit('SIGINT', 'SIGINT');
                    controller.error(new DOMException('aborted', 'AbortError'));
                },
            }),
        )));

        try {
            const { error } = await captureOutput(async () => MeProbe.run([], config));

            expect(error?.oclif?.exit).to.equal(exitCode.cancelled);
            expect(error?.message).to.equal('Cancelled.');
            expect(stub.callCount).to.equal(1);
        } finally {
            stub.restore();
        }
    });
});
