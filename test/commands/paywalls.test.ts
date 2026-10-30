import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

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

const PAYWALL_RESPONSE = { id: TEST_RESOURCE_ID, title: 'Default Paywall' };

const PRODUCT_ID = '770e8400-e29b-41d4-a716-446655440002';

const REMOTE_CONFIGS = [{ data: '{"cta":"Buy"}', locale: 'en' }, { data: '{"cta":"Acheter"}', locale: 'fr' }];

// The body of `paywalls get --json`: the file that `update --file` sends back
const FULL_PAYWALL = {
    builder_screenshot_id: 7,
    id: TEST_RESOURCE_ID,
    product_ids: [PRODUCT_ID],
    remote_configs: REMOTE_CONFIGS,
    screenshot_id: null,
    title: 'Default Paywall',
    use_paywall_builder_v4: true,
    web_purchase_url: 'https://example.com/buy',
};

const APP_ID_HINT = 'Invalid app ID format. Run `adapty apps list` to find your app ID.';

describe('paywalls', () => {
    let fetchStub: sinon.SinonStub;

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET /apps/{app}/paywalls', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);
        await runCommand(`paywalls list --app ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/paywalls/`, stub: fetchStub });
    });

    it('get calls GET /apps/{app}/paywalls/{id}', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ ...PAYWALL_RESPONSE, product_ids: [] }]);
        await runCommand(`paywalls get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/`, stub: fetchStub });
    });

    it('create calls POST /apps/{app}/paywalls', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([PAYWALL_RESPONSE]);
        await runCommand(`paywalls create --app ${TEST_APP_ID} --title "Default Paywall" --product-id ${TEST_RESOURCE_ID}`);

        assertFetch({
            body: { product_ids: [TEST_RESOURCE_ID], title: 'Default Paywall' },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/paywalls/`,
            stub: fetchStub,
        });
    });

    it('create sends the new fields it is given, with null as a literal', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([FULL_PAYWALL]);

        await runCommand([
            'paywalls',
            'create',
            '--app',
            TEST_APP_ID,
            '--title',
            'T',
            '--product-id',
            TEST_RESOURCE_ID,
            '--remote-configs',
            JSON.stringify(REMOTE_CONFIGS),
            '--use-paywall-builder-v4',
            '--screenshot-id',
            '12',
            '--web-purchase-url',
            'null',
        ]);

        assertFetch({
            body: {
                product_ids: [TEST_RESOURCE_ID],
                remote_configs: REMOTE_CONFIGS,
                screenshot_id: 12,
                title: 'T',
                use_paywall_builder_v4: true,
                web_purchase_url: null,
            },
            callIndex: 0,
            method: 'POST',
            path: `/apps/${TEST_APP_ID}/paywalls/`,
            stub: fetchStub,
        });
    });

    describe('update', () => {
        let dir: string;

        beforeEach(async () => {
            process.env.ADAPTY_TOKEN = 'test-token';
            fetchStub = mockFetch([FULL_PAYWALL]);
            dir = await mkdtemp(join(tmpdir(), 'paywall-update-'));
        });

        it('--file sends the body of `get --json` as it is', async () => {
            const file = join(dir, 'p.json');

            await writeFile(file, JSON.stringify({ ...FULL_PAYWALL, title: 'New' }));
            await runCommand(`paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${file}`);

            assertFetch({
                body: { ...FULL_PAYWALL, title: 'New' },
                callIndex: 0,
                method: 'PUT',
                path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/`,
                stub: fetchStub,
            });
        });

        it('sends every field from its flag, null as a literal and the builder flag off with --no-', async () => {
            await runCommand([
                'paywalls',
                'update',
                TEST_RESOURCE_ID,
                '--app',
                TEST_APP_ID,
                '--title',
                'T',
                '--product-id',
                TEST_RESOURCE_ID,
                '--remote-configs',
                '[]',
                '--no-use-paywall-builder-v4',
                '--screenshot-id',
                'null',
                '--builder-screenshot-id',
                '7',
                '--web-purchase-url',
                'null',
            ]);

            assertFetch({
                body: {
                    builder_screenshot_id: 7,
                    product_ids: [TEST_RESOURCE_ID],
                    remote_configs: [],
                    screenshot_id: null,
                    title: 'T',
                    use_paywall_builder_v4: false,
                    web_purchase_url: null,
                },
                callIndex: 0,
                method: 'PUT',
                path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/`,
                stub: fetchStub,
            });
        });

        it('lists every missing flag in one exit-2 error and sends no request', async () => {
            const result = await runCommand(
                `paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title T --product-id ${TEST_RESOURCE_ID}`,
            );

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);

            expect(result.error?.message).to.equal(
                'Missing flags: --remote-configs, --use-paywall-builder-v4 or --no-use-paywall-builder-v4, '
                + '--screenshot-id, --builder-screenshot-id, --web-purchase-url. '
                + 'Give every field (null is valid for --screenshot-id, --builder-screenshot-id and --web-purchase-url), '
                + 'or send the whole body with --file PATH|-.',
            );

            expect(fetchStub.callCount).to.equal(0);
        });

        it('--file - reads the body from stdin', async () => {
            const stdin = sinon.stub(process, 'stdin').value(Readable.from([Buffer.from(JSON.stringify(FULL_PAYWALL))]));

            try {
                await runCommand(`paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file -`);
            } finally {
                stdin.restore();
            }

            assertFetch({
                body: FULL_PAYWALL,
                callIndex: 0,
                method: 'PUT',
                path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/`,
                stub: fetchStub,
            });
        });

        it('refuses a --file that is not valid JSON, before any request', async () => {
            const file = join(dir, 'p.json');

            await writeFile(file, '{');

            const result = await runCommand(`paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${file}`);

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);
            expect(result.error?.message).to.contain(`Invalid ${file} JSON:`);
            expect(fetchStub.callCount).to.equal(0);
        });

        it('refuses a --screenshot-id that is neither an integer nor null, before any request', async () => {
            const result = await runCommand(
                `paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --screenshot-id abc`,
            );

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);
            expect(result.error?.message).to.contain('Expected an image ID (an integer) or null.');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('refuses a --remote-configs that is not valid JSON, before any request', async () => {
            const result = await runCommand([
                'paywalls',
                'update',
                TEST_RESOURCE_ID,
                '--app',
                TEST_APP_ID,
                '--remote-configs',
                '[{',
            ]);

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);
            expect(result.error?.message).to.contain('Invalid --remote-configs JSON:');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('refuses --file together with a field flag, before any request', async () => {
            const file = join(dir, 'p.json');

            await writeFile(file, JSON.stringify(FULL_PAYWALL));

            const result = await runCommand(
                `paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${file} --title x`,
            );

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);
            expect(result.error?.message).to.contain('--title');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('refuses a --file that is not a JSON object, before any request', async () => {
            const file = join(dir, 'p.json');

            await writeFile(file, '[1]');

            const result = await runCommand(`paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --file ${file}`);

            expect(result.error?.oclif?.exit).to.equal(exitCode.usage);
            expect(result.error?.message).to.equal(`${file} must hold a JSON object.`);
            expect(fetchStub.callCount).to.equal(0);
        });
    });

    it('placements calls GET /apps/{app}/paywalls/{id}/placements', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([{ data: [] }]);
        await runCommand(`paywalls placements ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`);

        assertFetch({
            callIndex: 0,
            method: 'GET',
            path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/placements/`,
            stub: fetchStub,
        });
    });

    it('rejects an --app that is not a uuid with exit 2 before any request, under --json too', async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);

        const human = await runCommand('paywalls list --app not-a-uuid');

        // oclif keeps an exit code an earlier command left behind, so start from none
        process.exitCode = undefined;

        const json = await runCommand('paywalls list --app not-a-uuid --json');
        const exit = process.exitCode;

        process.exitCode = 0;

        expect(human.error?.oclif?.exit).to.equal(exitCode.usage);
        expect(human.error?.message).to.contain(APP_ID_HINT);
        expect(exit).to.equal(exitCode.usage);

        // A legacy command extends oclif's Command, which serializes the error object itself:
        // CliError.toJSON makes that the same clean shape a migrated command prints
        expect(JSON.parse(json.stdout)).to.deep.equal({ error: { message: APP_ID_HINT } });

        expect(fetchStub.callCount).to.equal(0);
    });
});
