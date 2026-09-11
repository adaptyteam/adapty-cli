import { expect } from 'chai';

import { ApiError, AuthRequiredError, CancelledError, NetworkError } from '../../../../src/sdk/core/errors.js';
import { createHttp, defaultRetryPolicy, defaultShouldRetry, retry } from '../../../../src/sdk/core/http/index.js';
import { createFakeClock, createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

import type { HttpOptions } from '../../../../src/sdk/core/http/index.js';
import type { FakeClock } from '../../../../src/sdk/core/testing.js';

type Script = Parameters<typeof createScriptedFetch>[0];

/** Every seam of the transport is an option, so a test overrides the one it is about. */
const setup = (script: Script, options: Partial<HttpOptions> & { clock?: FakeClock } = {}) => {
    const clock = options.clock ?? createFakeClock();
    const scripted = createScriptedFetch(script);

    const http = createHttp({
        baseUrl: 'https://api.example.com/api/v1',
        fetch: scripted.fetch,
        ...options,
        clock,
    });

    return { calls: scripted.calls, clock, http };
};

describe('createHttp', () => {
    it('builds the URL over the base prefix, sends bearer and JSON, parses the answer', async () => {
        const { calls, http } = setup([{ body: { id: 'pw_1' } }], { token: 'tok' });

        const result = await http.post<{ id: string }>('/apps/app_1/paywalls', { title: 'T' }, {
            query: { limit: 10, ids: ['a', 'b'], skip: undefined },
        });

        expect(result).to.deep.equal({ id: 'pw_1' });
        expect(calls).to.have.lengthOf(1);
        expect(calls[0]?.url).to.equal('https://api.example.com/api/v1/apps/app_1/paywalls/?limit=10&ids=a&ids=b');
        expect(calls[0]?.method).to.equal('POST');
        expect(calls[0]?.headers.get('authorization')).to.equal('Bearer tok');
        expect(calls[0]?.headers.get('content-type')).to.equal('application/json');
        expect(calls[0]?.body).to.equal('{"title":"T"}');
    });

    it('keeps the base path for empty and slash-only root paths', async () => {
        const { calls, http } = setup([{ body: {} }, { body: {} }]);

        await http.get('');
        await http.get('/');

        expect(calls.map(call => call.url)).to.deep.equal([
            'https://api.example.com/api/v1/',
            'https://api.example.com/api/v1/',
        ]);
    });

    it('turns 401 into AuthRequiredError with reason rejected', async () => {
        const { http } = setup([{ status: 401, body: { error: 'unauthorized' } }]);

        const error = await rejection(http.get('/me'));

        expect(error).to.be.instanceOf(AuthRequiredError);
        expect((error as AuthRequiredError).reason).to.equal('rejected');
    });

    it('gives undefined for 204 and an empty body, exposes response headers via onResponse', async () => {
        const { http } = setup([{ status: 204, headers: { etag: '"v7"' } }]);
        let etag: null | string = null;

        const result = await http.put('/flows/f1/config', {}, {
            onResponse: (headers) => {
                etag = headers.get('etag');
            },
        });

        expect(result).to.equal(undefined);
        expect(etag).to.equal('"v7"');
    });

    it('sends FormData as is, without content-type: application/json', async () => {
        const { calls, http } = setup([{ body: { ok: true } }]);
        const form = new FormData();

        form.set('file', new Blob(['x']), 'x.txt');
        await http.post('/uploads', form);

        expect(calls[0]?.headers.get('content-type')).to.not.equal('application/json');
    });

    it('turns 4xx into ApiError carrying the code from the body', async () => {
        const { http } = setup([{ status: 400, body: { error: 'authorization_pending' } }]);

        const error = await rejection(http.post('/oauth/token', {}));

        expect(error).to.be.instanceOf(ApiError);
        expect((error as ApiError).status).to.equal(400);
        expect((error as ApiError).code).to.equal('authorization_pending');
    });

    it('retries a GET after 503 using the delay from Retry-After', async () => {
        const { calls, clock, http } = setup([
            { status: 503, body: { error: { code: 'unavailable', message: 'later' } }, headers: { 'retry-after': '2' } },
            { body: [] },
        ]);

        expect(await http.get('/apps')).to.deep.equal([]);
        expect(calls).to.have.lengthOf(2);
        expect(clock.sleeps).to.deep.equal([2000]);
    });

    it('retries network failures with exponential backoff, then gives up', async () => {
        const { calls, clock, http } = setup([
            new TypeError('fetch failed'),
            new TypeError('fetch failed'),
            new TypeError('fetch failed'),
        ]);

        expect(await rejection(http.get('/apps'))).to.be.instanceOf(NetworkError);
        expect(calls).to.have.lengthOf(3);
        expect(clock.sleeps).to.deep.equal([500, 1000]);
    });

    it('retries a GET when the connection drops while reading the body', async () => {
        const clock = createFakeClock();
        let calls = 0;

        const http = createHttp({
            baseUrl: 'https://api.example.com/api/v1',
            clock,
            fetch: () => {
                calls += 1;

                const body = calls === 1
                    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Web streams exist in Node 22; only their stability label changed later.
                    ? new ReadableStream({
                            start(controller) {
                                controller.error(new TypeError('terminated'));
                            },
                        })
                    : '{"ok":true}';

                return Promise.resolve(new Response(body));
            },
        });

        expect(await http.get('/apps')).to.deep.equal({ ok: true });
        expect(calls).to.equal(2);
        expect(clock.sleeps).to.deep.equal([500]);
    });

    it('reports a body read failure as NetworkError without retrying a POST', async () => {
        const cause = new TypeError('terminated');
        const clock = createFakeClock();
        let calls = 0;

        const http = createHttp({
            baseUrl: 'https://api.example.com/api/v1',
            clock,
            fetch: () => {
                calls += 1;

                // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Web streams exist in Node 22; only their stability label changed later.
                return Promise.resolve(new Response(new ReadableStream({
                    start(controller) {
                        controller.error(cause);
                    },
                })));
            },
        });

        const error = await rejection(http.post('/apps', {}));

        expect(error).to.be.instanceOf(NetworkError);
        expect((error as NetworkError).cause).to.equal(cause);
        expect((error as NetworkError).url).to.equal('https://api.example.com/api/v1/apps/');
        expect(calls).to.equal(1);
        expect(clock.sleeps).to.deep.equal([]);
    });

    it('does not treat a caller response callback failure as a network failure', async () => {
        const { calls, clock, http } = setup([{ body: {} }]);
        const cause = new Error('callback failed');

        const error = await rejection(http.get('/apps', {
            onResponse: () => {
                throw cause;
            },
        }));

        expect(error).to.equal(cause);
        expect(calls).to.have.lengthOf(1);
        expect(clock.sleeps).to.deep.equal([]);
    });

    it('does not retry cancellation during a body read, even if it arrives as a TypeError', async () => {
        for (const cause of [new DOMException('aborted', 'AbortError'), new TypeError('terminated')]) {
            const controller = new AbortController();
            const clock = createFakeClock();
            let calls = 0;

            const http = createHttp({
                baseUrl: 'https://api.example.com/api/v1',
                clock,
                fetch: () => {
                    calls += 1;

                    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Web streams exist in Node 22; only their stability label changed later.
                    return Promise.resolve(new Response(new ReadableStream({
                        pull(stream) {
                            // AbortError alone must also work without an aborted client signal.
                            if (cause instanceof TypeError) {
                                controller.abort();
                            }

                            stream.error(cause);
                        },
                    })));
                },
                signal: controller.signal,
            });

            expect(await rejection(http.get('/apps'))).to.be.instanceOf(CancelledError);
            expect(calls).to.equal(1);
            expect(clock.sleeps).to.deep.equal([]);
        }
    });

    it('does not retry a POST by default', async () => {
        const { calls, http } = setup([{ status: 503, body: {} }]);

        expect(await rejection(http.post('/apps', {}))).to.be.instanceOf(ApiError);
        expect(calls).to.have.lengthOf(1);
    });

    it('retries a POST marked idempotent', async () => {
        const { calls, http } = setup([{ status: 503, body: {} }, { body: { ok: true } }]);

        expect(await http.post('/writes', {}, { idempotent: true })).to.deep.equal({ ok: true });
        expect(calls).to.have.lengthOf(2);
    });

    it('gives CancelledError for an already aborted signal, without touching the network', async () => {
        const controller = new AbortController();

        controller.abort();

        const { calls, http } = setup([{ body: {} }], { signal: controller.signal });

        expect(await rejection(http.get('/apps'))).to.be.instanceOf(CancelledError);
        expect(calls).to.have.lengthOf(0);
    });

    it('turns an AbortError from fetch into CancelledError', async () => {
        const { http } = setup([new DOMException('aborted', 'AbortError')]);

        expect(await rejection(http.post('/apps', {}))).to.be.instanceOf(CancelledError);
    });

    it('combines the client signal with the per-request one', async () => {
        const client = new AbortController();
        const request = new AbortController();

        request.abort();

        // only the client signal is passed at construction, so this fires only if the two are combined
        const { calls, http } = setup([{ body: {} }], { signal: client.signal });

        expect(await rejection(http.get('/apps', { signal: request.signal }))).to.be.instanceOf(CancelledError);
        expect(calls).to.have.lengthOf(0);
    });

    it('reads an abort during an in-flight request as cancellation, not as a network error to retry', async () => {
        const controller = new AbortController();
        const clock = createFakeClock();
        let calls = 0;

        const http = createHttp({
            baseUrl: 'https://api.example.com/api/v1',
            clock,
            fetch: () => {
                calls += 1;
                controller.abort();

                // a runtime that reports an interrupted fetch as something other than AbortError
                return Promise.reject(new TypeError('fetch failed'));
            },
            signal: controller.signal,
        });

        // a POST carries no retry wrapper, so the conversion in the transport is the only thing that can fire
        expect(await rejection(http.post('/apps', {}))).to.be.instanceOf(CancelledError);
        expect(calls).to.equal(1);
        expect(clock.sleeps).to.deep.equal([]);
    });

    it('reads the third body shape the default parser tolerates: { code, detail }', async () => {
        const { http } = setup([{ status: 403, body: { code: 'forbidden', detail: 'not your app' } }]);

        const error = await rejection(http.post('/apps/app_1', {}));

        expect((error as ApiError).code).to.equal('forbidden');
        expect((error as ApiError).message).to.equal('not your app');
    });

    it('takes the error shape from the parser it was given', async () => {
        // the ASA shape: a list of per-item errors rather than one code at the top
        const parseError: HttpOptions['parseError'] = (_status, body) => {
            const [first] = (body as { errors?: { error_code?: string; message?: string }[] }).errors ?? [];

            return { code: first?.error_code, message: first?.message };
        };

        const { http } = setup(
            [{ status: 400, body: { errors: [{ error_code: 'quota_exceeded', message: 'too many keywords' }] } }],
            { parseError },
        );

        const error = await rejection(http.post('/campaigns', {}));

        expect((error as ApiError).code).to.equal('quota_exceeded');
        expect((error as ApiError).message).to.equal('too many keywords');
    });

    it('takes the retry rule it was given: a 429 the default would repeat can be refused', async () => {
        const { calls, http } = setup([{ status: 429, body: { error: 'cli_cooldown_active' } }], {
            shouldRetry: error => (error instanceof ApiError && error.code === 'cli_cooldown_active' ? false : {}),
        });

        expect(await rejection(http.get('/campaigns'))).to.be.instanceOf(ApiError);
        expect(calls).to.have.lengthOf(1);
    });

    it('takes a Retry-After given as an HTTP date, measured against the injected clock', async () => {
        const start = Date.parse('2030-01-01T12:00:00Z');
        const clock = createFakeClock(start);

        const { calls, http } = setup([
            { status: 503, body: {}, headers: { 'retry-after': new Date(start + 30_000).toUTCString() } },
            { body: { ok: true } },
        ], { clock });

        expect(await http.get('/apps')).to.deep.equal({ ok: true });
        expect(calls).to.have.lengthOf(2);
        expect(clock.sleeps).to.deep.equal([30_000]);
    });

    it('clamps a Retry-After date already in the past to no wait', async () => {
        const start = Date.parse('2030-01-01T12:00:00Z');
        const clock = createFakeClock(start);

        const { http } = setup([
            { status: 503, body: {}, headers: { 'retry-after': new Date(start - 60_000).toUTCString() } },
            { body: { ok: true } },
        ], { clock });

        await http.get('/apps');

        expect(clock.sleeps).to.deep.equal([0]);
    });

    it('leaves the path alone for a server that wants no trailing slash', async () => {
        const { calls, http } = setup([{ body: [] }], { trailingSlash: false });

        await http.get('/apps', { query: { page: 1 } });

        expect(calls[0]?.url).to.equal('https://api.example.com/api/v1/apps?page=1');
    });

    it('keeps a body that is not JSON as text instead of failing to parse it', async () => {
        // a proxy answering 502 with an HTML page: the text is more useful than a parse error
        const html = '<html><body>502 Bad Gateway</body></html>';
        let calls = 0;

        const http = createHttp({
            baseUrl: 'https://api.example.com/api/v1',
            clock: createFakeClock(),
            fetch: () => {
                calls += 1;

                return Promise.resolve(new Response(html, { status: 502 }));
            },
            retry: { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
        });

        const error = await rejection(http.get('/apps'));

        expect(error).to.be.instanceOf(ApiError);
        expect((error as ApiError).details).to.equal(html);
        expect(calls).to.equal(1);
    });

    it('reports a retry to the caller instead of printing anything itself', async () => {
        const seen: { attempt: number; delayMs: number }[] = [];

        const { http } = setup([{ status: 503, body: {} }, { body: { ok: true } }], {
            onRetry: ({ attempt, delayMs }) => {
                seen.push({ attempt, delayMs });
            },
        });

        await http.get('/apps');

        expect(seen).to.deep.equal([{ attempt: 1, delayMs: 500 }]);
    });
});

describe('retry', () => {
    it('notices cancellation in the wait between attempts', async () => {
        const controller = new AbortController();
        const clock = createFakeClock();
        let attempts = 0;

        const failing = () => {
            attempts += 1;
            controller.abort();

            return Promise.reject(new NetworkError('https://api.example.com/apps/', new TypeError('fetch failed')));
        };

        const error = await rejection(retry(failing, {
            clock,
            policy: defaultRetryPolicy,
            shouldRetry: defaultShouldRetry,
            signal: controller.signal,
        }));

        expect(error).to.be.instanceOf(CancelledError);
        expect(attempts).to.equal(1);
        expect(clock.sleeps).to.deep.equal([]);
    });
});
