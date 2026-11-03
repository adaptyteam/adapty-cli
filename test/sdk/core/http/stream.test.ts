import { expect } from 'chai';

import { ApiError, AuthRequiredError, NetworkError } from '../../../../src/sdk/core/errors.js';
import { createHttp } from '../../../../src/sdk/core/http/index.js';
import { createFakeClock, createScriptedFetch } from '../../../../src/sdk/core/testing.js';
import { rejection } from '../../../helpers/rejection.js';

type Script = Parameters<typeof createScriptedFetch>[0];

const setup = (script: Script) => {
    const clock = createFakeClock();
    const scripted = createScriptedFetch(script);
    const http = createHttp({ baseUrl: 'https://api.example.com/api/v1', clock, fetch: scripted.fetch, token: 'tok' });

    return { calls: scripted.calls, clock, http };
};

const encoder = new TextEncoder();

/**
 * A body that sends its chunks and then breaks, as a dropped connection does. The break comes on the
 * read after the last chunk: error() drops whatever is still queued.
 */
const breaking = (...chunks: string[]): ReadableStream<Uint8Array> => {
    const queue = [...chunks];

    return new ReadableStream({
        pull(controller) {
            const next = queue.shift();

            if (next === undefined) {
                controller.error(new TypeError('terminated'));
            } else {
                controller.enqueue(encoder.encode(next));
            }
        },
    });
};

const readAll = async (body: ReadableStream<Uint8Array>): Promise<Buffer> => {
    const chunks: Uint8Array[] = [];

    for await (const chunk of body) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
};

describe('createHttp: stream', () => {
    it('hands a 2xx body over unread: the bytes are the server\'s, spacing and 17.0 included', async () => {
        const raw = '{"price": 17.0,  "x": [1, 2]}\n';
        const { calls, http } = setup([{ headers: { 'content-type': 'application/json' }, raw }]);

        const { body, headers } = await http.stream('/files', { query: { platform: 'iOS' } });

        expect((await readAll(body)).toString('utf8')).to.equal(raw);
        expect(headers.get('content-type')).to.equal('application/json');
        expect(calls[0]?.method).to.equal('GET');
        expect(calls[0]?.url).to.equal('https://api.example.com/api/v1/files/?platform=iOS');
        expect(calls[0]?.headers.get('authorization')).to.equal('Bearer tok');
    });

    it('maps a non-2xx answer to the same errors as get', async () => {
        const { http } = setup([
            { body: { error_code: 'not_found' }, status: 404 },
            { body: { error_code: 'not_found' }, status: 404 },
            { body: {}, status: 401 },
        ]);

        const streamed = await rejection(http.stream('/files'));
        const got = await rejection(http.get('/files'));

        expect(streamed).to.be.instanceOf(ApiError);
        expect(streamed).to.deep.include({ code: (got as ApiError).code, status: 404 });
        expect(await rejection(http.stream('/files'))).to.be.instanceOf(AuthRequiredError);
    });

    it('retries until the headers arrive, then hands the body over', async () => {
        const { calls, clock, http } = setup([{ body: {}, status: 503 }, { raw: '{}' }]);

        const { body } = await http.stream('/files');

        expect((await readAll(body)).toString('utf8')).to.equal('{}');
        expect(calls).to.have.lengthOf(2);
        expect(clock.sleeps).to.deep.equal([500]);
    });

    it('does not retry a body that breaks after it was handed over, and says it was the network', async () => {
        const { calls, http } = setup([{ raw: breaking('{"a"') }, { raw: '{}' }]);

        const { body } = await http.stream('/files');
        const reader = body.getReader();
        const first = await reader.read();

        expect(Buffer.from(first.value ?? []).toString('utf8')).to.equal('{"a"');
        expect(await rejection(reader.read())).to.be.instanceOf(NetworkError);
        expect(calls).to.have.lengthOf(1);
    });

    it('sends exactly one request with retry: false, whatever the failure', async () => {
        const failures: Script = [
            { body: {}, status: 502 },
            { body: {}, headers: { 'retry-after': '30' }, status: 429 },
            new TypeError('fetch failed'),
        ];

        for (const failure of failures) {
            const { calls, clock, http } = setup([failure, { raw: '{}' }]);

            const error = await rejection(http.stream('/files', { retry: false }));

            expect(error).to.be.instanceOf(failure instanceof Error ? NetworkError : ApiError);
            expect(calls).to.have.lengthOf(1);
            expect(clock.sleeps).to.deep.equal([]);
        }
    });
});
