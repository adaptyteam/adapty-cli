import { readFile } from 'node:fs/promises';

import { expect } from 'chai';

import { createAdapty } from '../../../src/sdk/adapty/index.js';
import { createScriptedFetch } from '../../../src/sdk/core/testing.js';

import type { FallbackFile } from '../../../src/sdk/adapty/index.js';

const BASE = 'https://api.example.com/v1';
const APP_ID = '550e8400-e29b-41d4-a716-446655440000';

const FILE = JSON.parse(await readFile(
    new URL('../../fixtures/fallback-file.json', import.meta.url), 'utf8',
)) as FallbackFile;

describe('adapty.fallbacks', () => {
    it('asks for one platform and one sdk version under the app, with the names the API uses', async () => {
        const scripted = createScriptedFetch([{ body: FILE }]);
        const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

        await adapty.fallbacks.get(APP_ID, { platform: 'iOS', sdkVersion: '4.1.0' });

        expect(scripted.calls[0]?.method).to.equal('GET');
        expect(scripted.calls[0]?.url).to.equal(`${BASE}/apps/${APP_ID}/fallbacks/?platform=iOS&sdk_version=4.1.0`);
    });

    it('passes the file through as the server sent it', async () => {
        const scripted = createScriptedFetch([{ body: FILE }]);
        const adapty = createAdapty({ baseUrl: BASE, fetch: scripted.fetch, token: 't' });

        const file = await adapty.fallbacks.get(APP_ID, { platform: 'Android', sdkVersion: '3.10.2' });

        expect(new URL(scripted.calls[0]?.url ?? '').searchParams.get('platform')).to.equal('Android');
        expect(file).to.deep.equal(FILE);
    });
});
