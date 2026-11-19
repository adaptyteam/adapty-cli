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

const writes = (sent: readonly SentRequest[]): string[] =>
    sent.filter(request => request.method !== 'GET').map(request => `${request.method} ${request.path.replace(FLOW_PATH, '')}`);

/**
 * external: `flows publish` refreshes the fonts as the builder does: what it writes, what it never
 * writes, and the exit code and `saved` an agent reads.
 */
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

    const run = async (answers: Parameters<typeof routes>[0], json = false) => {
        const fake = routeFetch(routes(answers));
        stub = fake.stub;

        const result = await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --yes${json ? ' --json' : ''}`);

        return { ...result, sent: fake.sent };
    };

    it('a stale copy: saves the config with the current fonts, the remote configs and the lock, then publishes', async () => {
        const { sent, stdout } = await run({});
        const save = sent.find(request => request.method === 'PUT');

        expect(writes(sent)).to.deep.equal(['PUT /config/', 'POST /publish/']);

        expect(save?.body).to.deep.equal({
            config: { ...storedConfig('').config, _meta: { fonts: [fontEntry('Brand-Bold-New')] } },
            expected_updated_at: 1_794_000_000_000,
            remote_configs: REMOTE_CONFIGS,
        });

        expect(stdout).to.include('Fonts refreshed: the flow config was saved with the current app fonts.');
        expect(stdout).to.include('Publishing started — status: publishing.');
    });

    it('a current copy: no config write, publication started', async () => {
        const { error, sent } = await run({ config: { body: storedConfig('Brand-Bold-New') } });

        expect(error).to.equal(undefined);
        expect(writes(sent)).to.deep.equal(['POST /publish/']);
    });

    it('the font list cannot be read: exit 4 with the API error, nothing written', async () => {
        const { error, sent } = await run({ fonts: { body: { detail: 'Not found.' }, status: 404 } });

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(writes(sent)).to.deep.equal([]);
    });

    it('a save conflict stops before the publish', async () => {
        const conflict = { body: { error_code: 'flow_config_conflict', errors: { non_field_errors: ['Changed.'] }, status_code: 409 }, status: 409 };

        const { error, sent } = await run({ save: conflict });

        expect(error?.message).to.match(/^Nothing was published: the save of the flow config with the current fonts failed\.\nChanged\./);
        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(writes(sent)).to.deep.equal(['PUT /config/']);
    });

    it('a refused publish after the save says the save stays (saved: true)', async () => {
        const refused = { body: { error_code: 'validation_error', errors: { non_field_errors: ['No version.'] } }, status: 400 };

        const { sent, stdout } = await run({ publish: refused }, true);
        const failure = JSON.parse(stdout) as { error: { message: string; saved?: boolean } };

        expect(writes(sent)).to.deep.equal(['PUT /config/', 'POST /publish/']);
        expect(failure.error.saved).to.equal(true);
        expect(failure.error.message).to.include('Flow publish failed: No version.');
        expect(failure.error.message).to.include('that save stays');
        expect(process.exitCode).to.equal(1);
    });
});
