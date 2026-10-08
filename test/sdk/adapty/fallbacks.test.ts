import { readFile } from 'node:fs/promises';

import { expect } from 'chai';

import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { ApiError } from '../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

const BASE = 'https://api.example.com/v1';
const APP_ID = '550e8400-e29b-41d4-a716-446655440000';

const FILE = await readFile(new URL('../../fixtures/fallback-file.json', import.meta.url));

const readAll = async (body: ReadableStream<Uint8Array>): Promise<Buffer> => {
    const chunks: Uint8Array[] = [];

    for await (const chunk of body) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
};

describe('adapty.fallbacks', () => {
    it('asks for one platform and one sdk version under the app, with the names the API uses', async () => {
        const scripted = createScriptedFetch([{ raw: new Uint8Array(FILE) }]);
        const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

        await adapty.fallbacks.download(APP_ID, { platform: 'iOS', sdkVersion: '4.1.0' });

        expect(scripted.calls[0]?.method).to.equal('GET');
        expect(scripted.calls[0]?.url).to.equal(`${BASE}/apps/${APP_ID}/fallbacks/?platform=iOS&sdk_version=4.1.0`);
    });

    it('passes the server\'s bytes through unparsed', async () => {
        const scripted = createScriptedFetch([{ raw: new Uint8Array(FILE) }]);
        const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

        const { body } = await adapty.fallbacks.download(APP_ID, { platform: 'Android', sdkVersion: '3.10.2' });

        expect(new URL(scripted.calls[0]?.url ?? '').searchParams.get('platform')).to.equal('Android');
        expect((await readAll(body)).equals(FILE)).to.equal(true);
    });

    it('never retries: one request for a 502 the transport would otherwise repeat', async () => {
        const scripted = createScriptedFetch([{ body: {}, status: 502 }, { raw: new Uint8Array(FILE) }]);
        const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

        const error = await rejection(adapty.fallbacks.download(APP_ID, { platform: 'iOS', sdkVersion: '4.1.0' }));

        expect(error).to.be.instanceOf(ApiError);
        expect(scripted.calls).to.have.lengthOf(1);
    });
});
