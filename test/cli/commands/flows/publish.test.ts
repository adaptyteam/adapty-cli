import { Readable } from 'node:stream';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../../../src/cli/errors.js';
import { TEST_APP_ID, TEST_RESOURCE_ID } from '../../../helpers/mock-fetch.js';
import { routeFetch } from '../../../helpers/route-fetch.js';

import type { Route, RouteAnswer, SentRequest } from '../../../helpers/route-fetch.js';

const FAMILY_ID = '11111111-1111-4111-8111-111111111111';
const FACE_ID = '33333333-3333-4333-8333-333333333333';
const FLOW = { id: TEST_RESOURCE_ID, name: 'Onboarding', status: 'draft', updated_at: '2026-11-01T10:00:00Z' };
const REMOTE_CONFIGS = [{ data: '{"x":1}', locale: 'en' }];

const FAMILY = {
    default_face_id: FACE_ID,
    faces: [{
        family_id: FAMILY_ID,
        file_format: 'otf',
        file_id: 7,
        file_url: 'https://cdn/b.otf',
        font_alias_android: 'brand',
        font_alias_ios: 'Brand-Bold-New',
        id: FACE_ID,
        is_default: true,
        italic: false,
        metadata_status: 'confirmed',
        weight: 700,
    }],
    id: FAMILY_ID,
    name: 'Brand',
};

const fontEntry = (iosName: string) => ({
    androidName: 'brand',
    faces: [{ androidName: 'brand', id: FACE_ID, iosName, isDefault: true, italic: false, url: 'https://cdn/b.otf', weight: 700 }],
    id: FAMILY_ID,
    iosName,
    name: 'Brand',
    url: 'https://cdn/b.otf',
});

const storedConfig = (iosName: string) => ({
    config: { _meta: { fonts: [fontEntry(iosName)] }, screens: [{ title: { textFamily: { id: FAMILY_ID, type: 'user' } } }] },
    remote_configs: REMOTE_CONFIGS,
    status: 'published',
    updated_at: 1_794_000_000_000,
});

const RESOURCE_PATH = `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}`;
const FLOW_PATH = `/api/v1/developer${RESOURCE_PATH}`;

type Answers = {
    config?: RouteAnswer;
    flow?: RouteAnswer;
    fonts?: RouteAnswer;
    publish?: RouteAnswer;
    save?: RouteAnswer;
};

const routes = (answers: Answers): Route[] => [
    { answers: [answers.flow ?? { body: FLOW }], method: 'GET', path: new RegExp(`/flows/${TEST_RESOURCE_ID}/$`) },
    { answers: [answers.config ?? { body: storedConfig('Brand-Bold-Old') }], method: 'GET', path: /\/config\/$/ },
    { answers: [answers.fonts ?? { body: { data: [FAMILY] } }], method: 'GET', path: /\/media\/fonts\/$/ },
    { answers: [answers.save ?? { body: storedConfig('Brand-Bold-New') }], method: 'PUT', path: /\/config\/$/ },
    { answers: [answers.publish ?? { body: { ...FLOW, status: 'publishing' } }], method: 'POST', path: /\/publish\/$/ },
];

/** The requests the command sent, as `METHOD path` below the flow; a font list read is `GET fonts`. */
const requests = (sent: readonly SentRequest[]): string[] => sent
    .filter(request => request.method !== 'GET' || request.path.endsWith('/media/fonts/'))
    .map(request => (request.method === 'GET' ? 'GET fonts' : `${request.method} ${request.path.replace(FLOW_PATH, '')}`));

const { updated_at: _lock, ...withoutLock } = storedConfig('Brand-Bold-Old');
const { remote_configs: _remote, ...withoutRemoteConfigs } = storedConfig('Brand-Bold-Old');

/** A proxy's HTML page, sent as raw text. */
const GATEWAY_PAGE = { contentType: 'text/html', raw: '<html>Gateway page</html>' };
const NO_VERSION = { error_code: 'validation_error', errors: { non_field_errors: ['Flow version does not exist.'] }, status_code: 404 };

const UNKNOWN_SAVE = 'Nothing was published: the answer to the save of the flow config with the current fonts could not be read, '
    + 'so it is not known whether the save went through.';

const READBACK = `Run \`adapty flows config get --app ${TEST_APP_ID} ${TEST_RESOURCE_ID}\` to see the stored config, `
    + `then run \`adapty flows publish --app ${TEST_APP_ID} ${TEST_RESOURCE_ID}\` again.`;

/** A config that names the family by its name, and an app where two families have that name. */
const byName = { ...storedConfig('Brand-Bold-Old'), config: { screens: [{ title: { textFamily: { id: 'Brand', type: 'user' } } }] } };
const twoBrands = { data: [FAMILY, { ...FAMILY, id: '77777777-7777-4777-8777-777777777777', name: 'BRAND' }] };

const noFontNamed = (fonts: unknown[]) => ({
    ...storedConfig(''),
    config: { _meta: { fonts }, screens: [{ title: { text: 'Hi' } }] },
});

type Row = {
    answers: Answers;
    exit: number;
    id: string;
    json?: boolean;
    /** Part of the error message, or of stdout on a success. */
    output: string;
    requests: string[];
    save?: unknown;
    saved?: boolean;
};

/**
 * external: `flows publish` refreshes the fonts as the builder does: what it writes, what it never
 * writes (no save without the lock it read), and the exit code and `saved` an agent reads.
 */
const rows: Row[] = [
    {
        answers: {},
        exit: 0,
        id: 'a stale copy: the save with the current fonts, the remote configs and the lock, then the publish',
        output: 'Fonts refreshed: the flow config was saved with the current app fonts.',
        requests: ['GET fonts', 'PUT /config/', 'POST /publish/'],
        save: {
            config: { ...storedConfig('').config, _meta: { fonts: [fontEntry('Brand-Bold-New')] } },
            expected_updated_at: 1_794_000_000_000,
            remote_configs: REMOTE_CONFIGS,
        },
    },
    {
        answers: { config: { body: storedConfig('Brand-Bold-New') } },
        exit: 0,
        id: 'a current copy: no config write, publication started',
        output: 'Publishing started — status: publishing.',
        requests: ['GET fonts', 'POST /publish/'],
    },
    {
        answers: { fonts: { body: { detail: 'Not found.' }, status: 404 } },
        exit: exitCode.api,
        id: 'the font list cannot be read: exit 4, nothing written',
        output: 'failed with HTTP 404',
        requests: ['GET fonts'],
    },
    {
        answers: { config: { body: byName }, fonts: { body: twoBrands } },
        exit: exitCode.usage,
        id: 'a name that two families share: no guess, exit 2 naming it, nothing written',
        output: `The flow names the font family "Brand", which 2 font families of the app match (${FAMILY_ID}, ${twoBrands.data[1]?.id}). `
            + 'Rename one of them, or name the family by its id in the flow. Nothing was saved or published.',
        requests: ['GET fonts'],
    },
    {
        answers: { flow: { body: { error_code: 'flow_not_found', errors: { non_field_errors: ['Flow does not exist.'] } }, status: 404 } },
        exit: exitCode.api,
        id: 'a flow that does not exist: exit 4 as every API refusal (exit 1 up to 0.32.0), nothing else sent',
        output: 'Flow does not exist.',
        requests: [],
    },
    {
        answers: {
            config: { body: NO_VERSION, status: 404 },
            publish: { body: { ...NO_VERSION, status_code: 400 }, status: 400 },
        },
        exit: 1,
        id: 'an explicit no-version error on the config read still lets the server decide whether to publish',
        output: 'Flow publish failed: Flow version does not exist.',
        requests: ['POST /publish/'],
    },
    {
        answers: { config: { ...GATEWAY_PAGE, status: 404 } },
        exit: exitCode.api,
        id: 'an HTML 404 on the config read stops the publish',
        output: 'failed with HTTP 404',
        requests: [],
    },
    {
        answers: { config: { body: withoutLock } },
        exit: exitCode.api,
        id: 'a config answer without updated_at: exit 4 naming it, nothing read further, nothing written',
        output: 'The flow config answer has no updated_at. Nothing was written and nothing was published.',
        requests: [],
    },
    {
        answers: { config: GATEWAY_PAGE },
        exit: exitCode.api,
        id: 'a config answer that is an HTML page: exit 4, nothing written, no publish',
        output: 'The flow config answer is not a JSON object. Nothing was written and nothing was published.',
        requests: [],
    },
    {
        answers: { save: GATEWAY_PAGE },
        exit: exitCode.api,
        id: 'a save answered with an HTML page: exit 4, the save may be done, no publish',
        output: `${UNKNOWN_SAVE}\nThe flow config answer is not a JSON object.\n${READBACK}`,
        requests: ['GET fonts', 'PUT /config/'],
    },
    {
        answers: { save: { lostBody: true, status: 200 } },
        exit: exitCode.network,
        id: 'a save whose 200 answer is lost: exit 5 with readback, no publish',
        json: true,
        output: `${UNKNOWN_SAVE}\nThe connection failed before a complete answer arrived.\n${READBACK}`,
        requests: ['GET fonts', 'PUT /config/'],
    },
    {
        answers: { config: { body: withoutRemoteConfigs } },
        exit: exitCode.api,
        id: 'a config answer without remote_configs: exit 4 naming it, nothing written',
        output: 'The flow config answer has no remote_configs',
        requests: ['GET fonts'],
    },
    {
        answers: { config: { body: noFontNamed([fontEntry('Brand-Bold-Old')]) } },
        exit: 0,
        id: 'no custom font named any more: the stale copy is cleared without a font list read',
        output: 'Fonts refreshed',
        requests: ['PUT /config/', 'POST /publish/'],
        save: {
            config: noFontNamed([]).config,
            expected_updated_at: 1_794_000_000_000,
            remote_configs: REMOTE_CONFIGS,
        },
    },
    {
        answers: { config: { body: noFontNamed([]) } },
        exit: 0,
        id: 'no custom font and no copy: the publish only',
        output: 'Publishing started',
        requests: ['POST /publish/'],
    },
    {
        answers: { save: { body: { error_code: 'flow_config_conflict', errors: { non_field_errors: ['Changed.'] } }, status: 409 } },
        exit: exitCode.api,
        id: 'a save conflict stops before the publish',
        output: 'Nothing was published: the save of the flow config with the current fonts failed.\nChanged.',
        requests: ['GET fonts', 'PUT /config/'],
    },
    {
        answers: { save: { ...GATEWAY_PAGE, status: 400 } },
        exit: exitCode.api,
        id: 'an HTML 400 on the save remains an API refusal, with no publish',
        output: 'Nothing was published: the save of the flow config with the current fonts failed.\n'
            + `PUT ${RESOURCE_PATH}/config failed with HTTP 400`,
        requests: ['GET fonts', 'PUT /config/'],
    },
    {
        answers: { publish: { body: { error_code: 'validation_error', errors: { non_field_errors: ['No version.'] } }, status: 400 } },
        exit: 1,
        id: 'a refused publish after the save says the save stays (saved: true)',
        json: true,
        output: 'Flow publish failed: No version.',
        requests: ['GET fonts', 'PUT /config/', 'POST /publish/'],
        saved: true,
    },
];

describe('flows publish refreshes the fonts', () => {
    let stub: sinon.SinonStub | undefined;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        process.exitCode = undefined;
        stub?.restore();
        stub = undefined;
        delete process.env.ADAPTY_TOKEN;
    });

    for (const row of rows) {
        it(row.id, async () => {
            const fake = routeFetch(routes(row.answers));
            stub = fake.stub;

            const json = row.json === true ? ' --json' : '';
            const { error, stdout } = await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --yes${json}`);
            type Failure = { error: { message: string; saved?: boolean } };

            const failure = row.json === true && row.exit !== 0 ? (JSON.parse(stdout) as Failure).error : undefined;
            const text = failure?.message ?? error?.message ?? stdout;
            const exit = error?.oclif?.exit ?? process.exitCode ?? 0;

            expect(requests(fake.sent), row.id).to.deep.equal(row.requests);
            expect(text, row.id).to.include(row.output);
            expect(exit, row.id).to.equal(row.exit);

            if (row.save !== undefined) {
                expect(fake.sent.find(request => request.method === 'PUT')?.body, row.id).to.deep.equal(row.save);
            }

            if (row.saved !== undefined) {
                expect(failure?.saved, row.id).to.equal(row.saved);
            }
        });
    }
});

/**
 * external: the question of `flows publish` as it was published: with --json or no terminal on stdin it sends
 * nothing and exits 2 with the reason and the requests on stderr; a terminal on stdin is asked, whatever stdout is,
 * with the summary and the requests in the order they are sent; any answer but y or yes sends nothing (exit 1).
 */
describe('flows publish asks first', () => {
    const SUMMARY = 'Publish flow "Onboarding" live to end users, after saving its config with the current fonts';
    const REASON = `${SUMMARY} changes your account. Re-run with --yes to apply it without a prompt.`;
    const SHOWN = `${SUMMARY}\nPUT ${RESOURCE_PATH}/config/\nPOST ${RESOURCE_PATH}/publish/\n`;

    type Row = {
        answer?: string;
        exit: number;
        id: string;
        json: boolean;
        message?: string;
        stdinIsTTY: boolean;
        /** What it wrote to stderr. */
        written: string;
    };

    const rows: Row[] = [
        { exit: exitCode.usage, id: '--json: exit 2, the reason and the requests', json: true, message: REASON, stdinIsTTY: true, written: `${REASON}\n${SHOWN}` },
        { exit: exitCode.usage, id: 'no terminal on stdin: exit 2', json: false, message: REASON, stdinIsTTY: false, written: `${REASON}\n${SHOWN}` },
        { answer: 'y', exit: 0, id: 'a terminal on stdin, stdout piped: asked, y saves and publishes', json: false, stdinIsTTY: true, written: `${SHOWN}Apply? [y/N] ` },
        { answer: 'n', exit: 1, id: 'n: no writes, exit 1', json: false, message: 'Cancelled, nothing was sent.', stdinIsTTY: true, written: `${SHOWN}Apply? [y/N] ` },
    ];

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        process.exitCode = undefined;
        delete process.env.ADAPTY_TOKEN;
    });

    for (const row of rows) {
        it(row.id, async () => {
            const fake = routeFetch(routes({}));
            const input = Object.assign(Readable.from(row.answer === undefined ? [] : [`${row.answer}\n`]), { isTTY: row.stdinIsTTY });
            const stdin = sinon.stub(process, 'stdin').value(input);
            const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

            Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });

            try {
                const { error, stderr, stdout } = await runCommand(['flows', 'publish', TEST_RESOURCE_ID, '--app', TEST_APP_ID, ...(row.json ? ['--json'] : [])]);
                const failure = row.json ? (JSON.parse(stdout) as { error: { message: string } }).error : error;
                const writes = row.exit === 0 ? ['PUT /config/', 'POST /publish/'] : [];

                expect(fake.sent.filter(request => request.method === 'GET').map(request => request.path), row.id).to.deep.equal([
                    `${FLOW_PATH}/`, `${FLOW_PATH}/config/`, `/api/v1/developer/apps/${TEST_APP_ID}/media/fonts/`,
                ]);

                expect(requests(fake.sent), row.id).to.deep.equal(['GET fonts', ...writes]);
                expect(error?.oclif?.exit ?? process.exitCode ?? 0, row.id).to.equal(row.exit);
                expect(failure?.message, row.id).to.equal(row.message);
                expect(stderr, row.id).to.include(row.written);
            } finally {
                stdin.restore();
                fake.stub.restore();

                if (stdoutTTY === undefined) {
                    Reflect.deleteProperty(process.stdout, 'isTTY');
                } else {
                    Object.defineProperty(process.stdout, 'isTTY', stdoutTTY);
                }
            }
        });
    }
});
