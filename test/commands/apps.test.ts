import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    EMPTY_LIST_RESPONSE,
    mockFetch,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

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

        return Promise.resolve(new Response(JSON.stringify(step?.body), { status: step?.status ?? 200 }));
    });
};

const CREATE_IOS = 'apps create --title "My App" --platform ios --apple-bundle-id com.example.app';

describe('apps', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;
    });

    it('list calls GET /apps', async () => {
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);
        await runCommand('apps list');
        assertFetch({ callIndex: 0, method: 'GET', path: '/apps/', stub: fetchStub });
    });

    it('get calls GET /apps/{id}', async () => {
        fetchStub = mockFetch([{ id: TEST_APP_ID, platforms: [], sdk_key: 'sdk_key', secret_key: 'secret', title: 'My App' }]);
        await runCommand(`apps get ${TEST_APP_ID}`);
        assertFetch({ callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/`, stub: fetchStub });
    });

    it('create calls POST /apps then GET access-levels', async () => {
        fetchStub = mockFetch([
            { id: TEST_APP_ID, sdk_key: 'sdk_key', title: 'My App' },
            { items: [{ id: 'al-id', sdk_id: 'premium', title: 'Premium' }] },
        ]);

        await runCommand(CREATE_IOS);
        assertFetch({ body: { apple_bundle_id: 'com.example.app', platforms: ['ios'], title: 'My App' }, callIndex: 0, method: 'POST', path: '/apps/', stub: fetchStub });
        assertFetch({ callIndex: 1, method: 'GET', path: `/apps/${TEST_APP_ID}/access-levels/`, stub: fetchStub });
    });

    it('update calls PUT /apps/{id}', async () => {
        fetchStub = mockFetch([{ id: TEST_APP_ID, title: 'Updated' }]);
        await runCommand(`apps update ${TEST_APP_ID} --title "Updated"`);
        assertFetch({ body: { title: 'Updated' }, callIndex: 0, method: 'PUT', path: `/apps/${TEST_APP_ID}/`, stub: fetchStub });
    });

    /** The published defaults are part of the request, not only of --help. */
    it('list asks for the same page as before, and passes the flags on', async () => {
        fetchStub = mockFetch([EMPTY_LIST_RESPONSE]);

        await runCommand('apps list');
        assertFetch({ callIndex: 0, method: 'GET', path: '/apps/', query: { 'page[number]': '1', 'page[size]': '20' }, stub: fetchStub });

        await runCommand('apps list --page 2 --page-size 10');
        assertFetch({ callIndex: 1, method: 'GET', path: '/apps/', query: { 'page[number]': '2', 'page[size]': '10' }, stub: fetchStub });
    });

    /** Byte for byte the published output: labelled blocks, `---`, a dropped null, then the footer. */
    it('prints a page the way the published CLI prints it, and the raw answer under --json', async () => {
        const body = {
            data: [
                { id: TEST_APP_ID, sdk_key: 'sdk_key', title: 'My App' },
                { id: TEST_RESOURCE_ID, sdk_key: null, title: 'Other App' },
            ],
            meta: { pagination: { count: 2, page: 1, pages: 1 } },
        };

        fetchStub = mockFetch([body]);

        const { stdout } = await runCommand('apps list');

        expect(stdout).to.equal([
            `ID: ${TEST_APP_ID}`,
            'SDK Key: sdk_key',
            'Title: My App',
            '---',
            `ID: ${TEST_RESOURCE_ID}`,
            'Title: Other App',
            '',
            'Page 1 of 1 (2 total)',
            '',
        ].join('\n'));

        const json = await runCommand('apps list --json');

        expect(JSON.parse(json.stdout)).to.deep.equal(body);
    });

    it('rejects an app id that is not a uuid, with the published wording and before any request', async () => {
        fetchStub = mockFetch([{}]);

        const { error } = await runCommand('apps get not-a-uuid');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('Invalid app ID format');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('will not create an ios app without a bundle id, and names the flag', async () => {
        fetchStub = mockFetch([{}]);

        const { error } = await runCommand('apps create --title "My App" --platform ios');

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--apple-bundle-id');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('will not send an update with nothing in it', async () => {
        fetchStub = mockFetch([{}]);

        const { error } = await runCommand(`apps update ${TEST_APP_ID}`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('nothing to update');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('validates create and update input before requiring a token', async () => {
        delete process.env.ADAPTY_TOKEN;
        fetchStub = mockFetch([{}]);

        const cases = [
            { command: `apps update ${TEST_APP_ID}`, message: 'nothing to update' },
            { command: 'apps create --title "My App" --platform ios', message: '--apple-bundle-id' },
            { command: 'apps create --title "My App" --platform android', message: '--google-bundle-id' },
        ];

        for (const { command, message } of cases) {
            const human = await runCommand(command);

            expect(human.error?.oclif?.exit, command).to.equal(exitCode.usage);
            expect(human.error?.message).to.contain(message);

            const json = await runCommand(`${command} --json`);
            const result = JSON.parse(json.stdout) as { error: { message: string } };

            expect(result.error.message).to.contain(message);
            expect(result.error.message).to.not.contain('Not authenticated');
        }

        expect(fetchStub.callCount).to.equal(0);
    });

    it('still requires a token for valid create and update input', async () => {
        delete process.env.ADAPTY_TOKEN;
        fetchStub = mockFetch([{}]);

        for (const command of [CREATE_IOS, `apps update ${TEST_APP_ID} --title Updated`]) {
            const { error } = await runCommand(command);

            expect(error?.oclif?.exit, command).to.equal(exitCode.auth);
            expect(error?.message).to.contain('Not authenticated');
        }

        expect(fetchStub.callCount).to.equal(0);
    });

    /** Under --json the result is the app itself, so the courtesy request is skipped. */
    it('skips the access-level lookup under --json', async () => {
        const app = { id: TEST_APP_ID, sdk_key: 'sdk_key', title: 'My App' };

        fetchStub = mockFetch([app]);

        const { stdout } = await runCommand(`${CREATE_IOS} --json`);

        expect(JSON.parse(stdout)).to.deep.equal(app);
        expect(fetchStub.callCount).to.equal(1);
    });

    it('reports the created app even when the access levels cannot be read', async () => {
        fetchStub = mockFetchSteps([
            { body: { id: TEST_APP_ID, sdk_key: 'sdk_key', title: 'My App' } },
            { body: { error_code: 'forbidden' }, status: 403 },
        ]);

        const { stderr, stdout } = await runCommand(CREATE_IOS);

        expect(stdout).to.contain('App created!');
        expect(stdout).to.contain('Title: My App');
        expect(stderr).to.contain('Could not fetch access levels for new app');
    });

    /** The server's own words, not "POST /apps failed with HTTP 400". */
    it('reports a rejected create the way the server worded it', async () => {
        fetchStub = mockFetchSteps([{
            body: { error_code: 'validation_error', errors: { apple_bundle_id: ['already used'] } },
            status: 400,
        }]);

        const { error } = await runCommand(CREATE_IOS);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error?.message).to.equal('apple_bundle_id: already used');
        expect(error?.code).to.equal('validation_error');
    });

    it('preserves API error details in JSON along with the message, code and HTTP status', async () => {
        fetchStub = mockFetchSteps([{
            body: { error_code: 'validation_error', errors: { apple_bundle_id: ['already used'] } },
            status: 400,
        }]);

        const { stdout } = await runCommand(`${CREATE_IOS} --json`);

        expect(JSON.parse(stdout)).to.deep.equal({
            error: {
                code: 'validation_error',
                error_code: 'validation_error',
                errors: { apple_bundle_id: ['already used'] },
                message: 'apple_bundle_id: already used',
                status: 400,
                status_code: 400,
            },
        });

        expect(fetchStub.callCount).to.equal(1);
    });

    it('includes a fallback code and HTTP status in JSON when the server sends no error code', async () => {
        fetchStub = mockFetchSteps([{ body: {}, status: 403 }]);

        const { stdout } = await runCommand(`${CREATE_IOS} --json`);

        expect(JSON.parse(stdout)).to.deep.equal({
            error: {
                code: 'http_403',
                error_code: 'http_403',
                message: 'POST /apps failed with HTTP 403',
                status: 403,
                status_code: 403,
            },
        });
    });

    /** The published command catches everything here, so Ctrl+C looked like a failed request. */
    it('lets a Ctrl+C during the access-level lookup end the command', async () => {
        fetchStub = mockFetchSteps([{ body: { id: TEST_APP_ID, sdk_key: 'sdk_key', title: 'My App' } }]);

        fetchStub.onSecondCall().callsFake(() => {
            process.emit('SIGINT', 'SIGINT');

            return Promise.reject(new Error('aborted'));
        });

        const { error } = await runCommand(CREATE_IOS);

        expect(error?.oclif?.exit).to.equal(exitCode.cancelled);
    });
});
