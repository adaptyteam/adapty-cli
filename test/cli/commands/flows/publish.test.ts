import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../../../src/cli/errors.js';
import { TEST_APP_ID, TEST_RESOURCE_ID } from '../../../helpers/mock-fetch.js';
import { routeFetch } from '../../../helpers/route-fetch.js';

import type { Route, RouteAnswer, SentRequest } from '../../../helpers/route-fetch.js';
import type * as sinon from 'sinon';

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

const FLOW_PATH = `/api/v1/developer/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}`;

type Answers = { config?: RouteAnswer; fonts?: RouteAnswer; publish?: RouteAnswer; save?: RouteAnswer };

const routes = (answers: Answers): Route[] => [
    { answers: [{ body: FLOW }], method: 'GET', path: new RegExp(`/flows/${TEST_RESOURCE_ID}/$`) },
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
        answers: { config: { body: withoutLock } },
        exit: exitCode.api,
        id: 'a config answer without updated_at: exit 4 naming it, nothing written',
        output: 'The flow config answer has no updated_at',
        requests: ['GET fonts'],
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
