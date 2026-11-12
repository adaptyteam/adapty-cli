import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    EMPTY_LIST_RESPONSE,
    mockFetch,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

const FLOW_RESPONSE = { id: TEST_RESOURCE_ID, name: 'Onboarding', status: 'draft', updated_at: '2026-08-12T10:30:00Z' };

const CONFIG_RESPONSE = {
    config: { locales: [{ code: 'en' }], screens: [{ id: 'welcome' }] },
    remote_configs: [],
    status: 'draft',
    updated_at: 1_755_001_800_000,
};

describe('flows', () => {
    let fetchStub: sinon.SinonStub;

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET /apps/{app}/flows', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);
        await runCommand(`flows list --app ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/flows/`, stub: fetchStub });
    });

    it('get calls GET /apps/{app}/flows/{id}', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([FLOW_RESPONSE]);
        await runCommand(`flows get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/`, stub: fetchStub });
    });

    it('create calls POST /apps/{app}/flows', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([FLOW_RESPONSE]);
        await runCommand(`flows create --app ${TEST_APP_ID} --name "Onboarding"`);

        assertFetch({
            body: { name: 'Onboarding' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/flows/`,
            stub: fetchStub,
        });
    });

    it('update calls PUT /apps/{app}/flows/{id} with the new name', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([FLOW_RESPONSE]);
        await runCommand(`flows update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --name "Onboarding v2"`);

        assertFetch({
            body: { name: 'Onboarding v2' },
            callIndex: 0,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });
    });

    it('publish GETs the flow then POSTs /apps/{app}/flows/{id}/publish with no body', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([FLOW_RESPONSE, { ...FLOW_RESPONSE, status: 'publishing' }]);
        await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --yes`);

        assertFetch({
            callIndex: 0,
            method: 'GET',
            path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/`,
            stub: fetchStub,
        });

        assertFetch({
            callIndex: 1,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/publish/`,
            stub: fetchStub,
        });

        const init = fetchStub.getCall(1).args[1] as { body?: unknown };

        // ApiClient spells "no body" as null, which fetch treats the same as omitting it
        if (init.body != null) {
            throw new Error(`Expected no request body for publish, got ${JSON.stringify(init.body)}`);
        }
    });

    it('publish refuses non-interactively without --yes and never calls the publish endpoint', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([FLOW_RESPONSE]);

        const { error } = await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);
        const exit = (error as undefined | { oclif?: { exit?: number } })?.oclif?.exit;

        if (exit !== 2) {
            throw new Error(`Expected exit code 2, got ${exit}`);
        }

        for (let i = 0; i < fetchStub.callCount; i++) {
            const { method } = fetchStub.getCall(i).args[1] as { method: string };

            if (method === 'POST') {
                throw new Error('Publish endpoint must not be called without --yes');
            }
        }
    });

    it('publish enriches a 400 with builder + skill links pointing at the flow', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';

        fetchStub = sinon.stub(globalThis, 'fetch').callsFake((_url, init) => {
            const method = (init as undefined | { method?: string })?.method ?? 'GET';

            if (method === 'POST') {
                return Promise.resolve(new Response(
                    JSON.stringify({
                        error_code: 'validation_error',
                        errors: { non_field_errors: ['Flow has no current version.'] },
                    }),
                    { headers: { 'Content-Type': 'application/json' }, status: 400 },
                ));
            }

            return Promise.resolve(new Response(
                JSON.stringify(FLOW_RESPONSE),
                { headers: { 'Content-Type': 'application/json' }, status: 200 },
            ));
        });

        const { error } = await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --yes`);
        const exit = (error as undefined | { oclif?: { exit?: number } })?.oclif?.exit;

        if (exit === 0 || exit === undefined) {
            throw new Error(`Expected a non-zero exit, got ${exit}`);
        }

        const message = (error as undefined | { message?: string })?.message ?? '';

        if (!message.includes('Flow has no current version.')) {
            throw new Error(`Missing server reason: ${message}`);
        }

        if (!message.includes(`https://app.adapty.io/flows/${TEST_RESOURCE_ID}/builder`)) {
            throw new Error(`Missing builder link: ${message}`);
        }

        if (!message.includes('https://adapty.io/docs/flow-generator-skill')) {
            throw new Error(`Missing skill link: ${message}`);
        }
    });

    it('publish prints async guidance in human mode and clean JSON with --json', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([FLOW_RESPONSE, { ...FLOW_RESPONSE, status: 'publishing' }]);

        const human = await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --yes`);

        if (!human.stdout.includes('This is asynchronous; the flow is NOT published yet.')) {
            throw new Error(`Missing async guidance: ${human.stdout}`);
        }

        restoreFetch(fetchStub);
        fetchStub = mockFetch([FLOW_RESPONSE, { ...FLOW_RESPONSE, status: 'publishing' }]);

        const json = await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --yes --json`);

        if (json.stdout.includes('This is asynchronous')) {
            throw new Error(`Guidance leaked into --json stdout: ${json.stdout}`);
        }

        const parsed = JSON.parse(json.stdout) as { status: string };

        if (parsed.status !== 'publishing') {
            throw new Error(`Expected status publishing, got ${parsed.status}`);
        }
    });

    it('config get calls GET /apps/{app}/flows/{id}/config', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([CONFIG_RESPONSE]);
        await runCommand(`flows config get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);

        assertFetch({
            callIndex: 0,
            method: 'GET',
            path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/`,
            stub: fetchStub,
        });
    });

    it('config update calls PUT /apps/{app}/flows/{id}/config with the inline config', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([CONFIG_RESPONSE]);

        await runCommand([
            'flows',
            'config',
            'update',
            TEST_RESOURCE_ID,
            '--app',
            TEST_APP_ID,
            '--config',
            '{"locales":[],"screens":[]}',
            '--remote-configs',
            '[]',
        ]);

        assertFetch({
            body: { config: { locales: [], screens: [] }, remote_configs: [] },
            callIndex: 0,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/`,
            stub: fetchStub,
        });
    });

    it('config validate POSTs the config to /config/validate', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ issues: [], valid: true }]);

        await runCommand([
            'flows',
            'config',
            'validate',
            TEST_RESOURCE_ID,
            '--app',
            TEST_APP_ID,
            '--config',
            '{"locales":[],"screens":[]}',
        ]);

        assertFetch({
            body: { config: { locales: [], screens: [] } },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/validate/`,
            stub: fetchStub,
        });
    });

    it('config validate exits non-zero when the config is not publishable', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ issues: [{ message: 'missing screens', severity: 'error' }], valid: false }]);
        await runCommand(`flows config validate ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --config {"screens":[]}`);

        if (process.exitCode !== 1) {
            throw new Error(`Expected exit code 1, got ${process.exitCode}`);
        }

        process.exitCode = 0;
    });

    it('config update forwards remote-configs and the optimistic lock token', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([CONFIG_RESPONSE]);

        await runCommand([
            'flows',
            'config',
            'update',
            TEST_RESOURCE_ID,
            '--app',
            TEST_APP_ID,
            '--config',
            '{"screens":[]}',
            '--remote-configs',
            '[{"data":"{}","locale":"en"}]',
            '--expected-updated-at',
            '1755001800000',
        ]);

        assertFetch({
            body: {
                config: { screens: [] },
                expected_updated_at: 1_755_001_800_000,
                remote_configs: [{ data: '{}', locale: 'en' }],
            },
            callIndex: 0,
            method: 'PUT',
            path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/`,
            stub: fetchStub,
        });
    });

    describe('config update bodies', () => {
        const REMOTE_CONFIGS = [{ data: '{"cta":"Buy"}', locale: 'en' }];
        const CONFIG = { locales: [{ code: 'en' }], screens: [] };
        let dir: string;

        beforeEach(async () => {
            process.env.ADAPTY_TOKEN = 'test-token';
            fetchStub = mockFetch([CONFIG_RESPONSE]);
            dir = await mkdtemp(join(tmpdir(), 'flow-config-update-'));
        });

        it('--file sends config and remote_configs of the `get --json` envelope and ignores its other keys', async () => {
            const file = join(dir, 'f.json');

            await writeFile(
                file,
                JSON.stringify({ config: CONFIG, remote_configs: REMOTE_CONFIGS, status: 'draft', updated_at: 1 }),
            );

            await runCommand(
                `flows config update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${file} --expected-updated-at 5`,
            );

            assertFetch({
                body: { config: CONFIG, expected_updated_at: 5, remote_configs: REMOTE_CONFIGS },
                callIndex: 0,
                method: 'PUT',
                path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/`,
                stub: fetchStub,
            });
        });

        it('--file with remote_configs [] sends the empty list', async () => {
            const file = join(dir, 'f.json');

            await writeFile(file, JSON.stringify({ config: CONFIG, remote_configs: [] }));
            await runCommand(`flows config update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${file}`);

            assertFetch({
                body: { config: CONFIG, remote_configs: [] },
                callIndex: 0,
                method: 'PUT',
                path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/`,
                stub: fetchStub,
            });
        });

        it('--config-file without --remote-configs exits 2 with the missing flag and sends no request', async () => {
            const file = join(dir, 'c.json');

            await writeFile(file, JSON.stringify(CONFIG));

            const result = await runCommand(
                `flows config update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --config-file ${file}`,
            );

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);

            expect(result.error?.message).to.equal(
                'Missing flags: --remote-configs. Give both, or send the whole body with --file PATH|-.'
                + ' To keep the stored remote configs, pass `remote_configs` from `flows config get --json`; [] deletes them all.',
            );

            expect(fetchStub.callCount).to.equal(0);
        });

        it('with no body flag at all lists both missing flags and sends no request', async () => {
            const result = await runCommand(`flows config update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);

            expect(result.error?.message).to.equal(
                'Missing flags: --config or --config-file, --remote-configs. '
                + 'Give both, or send the whole body with --file PATH|-.'
                + ' To keep the stored remote configs, pass `remote_configs` from `flows config get --json`; [] deletes them all.',
            );

            expect(fetchStub.callCount).to.equal(0);
        });

        it('--file without remote_configs or config exits 2 naming the missing keys and sends no request', async () => {
            const noRemote = join(dir, 'no-remote.json');
            const noConfig = join(dir, 'no-config.json');

            await writeFile(noRemote, JSON.stringify({ config: CONFIG }));
            await writeFile(noConfig, JSON.stringify({ status: 'draft' }));

            const first = await runCommand(`flows config update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${noRemote}`);
            const second = await runCommand(`flows config update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${noConfig}`);

            expect(first.error?.oclif?.exit).to.equal(exitCode.usage);

            expect(first.error?.message).to.equal(
                `Missing keys in ${noRemote}: remote_configs. The file needs both config and remote_configs.`
                + ' To keep the stored remote configs, pass `remote_configs` from `flows config get --json`; [] deletes them all.',
            );

            expect(second.error?.oclif?.exit).to.equal(exitCode.usage);

            expect(second.error?.message).to.equal(
                `Missing keys in ${noConfig}: config, remote_configs. The file needs both config and remote_configs.`
                + ' To keep the stored remote configs, pass `remote_configs` from `flows config get --json`; [] deletes them all.',
            );

            expect(fetchStub.callCount).to.equal(0);
        });

        it('--file without config but with remote_configs names only config, with no remote config hint', async () => {
            const file = join(dir, 'no-config-only.json');

            await writeFile(file, JSON.stringify({ remote_configs: [] }));

            const result = await runCommand(`flows config update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${file}`);

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);

            expect(result.error?.message).to.equal(
                `Missing keys in ${file}: config. The file needs both config and remote_configs.`,
            );

            expect(fetchStub.callCount).to.equal(0);
        });

        it('refuses --file together with --remote-configs, before any request', async () => {
            const file = join(dir, 'f.json');

            await writeFile(file, JSON.stringify({ config: CONFIG, remote_configs: [] }));

            const result = await runCommand(
                `flows config update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${file} --remote-configs []`,
            );

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);
            expect(result.error?.message).to.contain('--remote-configs=[] cannot also be provided when using --file');
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    it('media upload POSTs multipart to /flows/media/images with the file field', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ id: 42, name: 'hero.png', preview_base64: 'x', url: 'https://cdn/hero.png' }]);
        const dir = await mkdtemp(join(tmpdir(), 'adapty-media-'));
        const path = join(dir, 'hero.png');
        await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

        await runCommand(`flows media upload ${path} --app ${TEST_APP_ID}`);

        const init = fetchStub.getCall(0).args[1] as { body: FormData; method: string };

        if (init.method !== 'POST') {
            throw new Error(`Expected POST, got ${init.method}`);
        }

        if (!(init.body instanceof FormData)) {
            throw new Error('Expected multipart FormData body');
        }

        const file = init.body.get('file') as File;

        if (file.name !== 'hero.png') {
            throw new Error(`Expected file name hero.png, got ${file.name}`);
        }

        if (file.type !== 'image/png') {
            throw new Error(`Expected image/png, got ${file.type}`);
        }

        const url = fetchStub.getCall(0).args[0] as string;
        const expected = `/apps/${TEST_APP_ID}/flows/media/images/`;

        if (!url.endsWith(expected)) {
            throw new Error(`Expected path ${expected}, got ${url}`);
        }
    });
});
