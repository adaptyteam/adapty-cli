import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../../../src/cli/errors.js';
import { TEST_APP_ID } from '../../../helpers/mock-fetch.js';
import { routeFetch } from '../../../helpers/route-fetch.js';

import type { Route, RouteAnswer, SentRequest } from '../../../helpers/route-fetch.js';
import type * as sinon from 'sinon';

const FAMILY_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const FACE_ID = '33333333-3333-4333-8333-333333333333';
const FLOW_ID = '44444444-4444-4444-8444-444444444444';
const FONTS = `/api/v1/developer/apps/${TEST_APP_ID}/media/fonts/`;

const face = (weight: number, italic = false) => ({
    family_id: FAMILY_ID,
    file_format: 'otf',
    file_id: 7,
    file_url: 'https://cdn.example.com/brand.otf',
    font_alias_android: null,
    font_alias_ios: `Brand-${weight}${italic ? 'i' : ''}`,
    id: weight === 700 ? FACE_ID : `face-${weight}${italic ? 'i' : ''}`,
    is_default: weight === 400 && !italic,
    italic,
    metadata_status: 'detected',
    weight,
});

const FAMILY = { default_face_id: 'face-400', faces: [face(400), face(700), face(400, true)], id: FAMILY_ID, name: 'Brand' };
const TARGET = { ...FAMILY, faces: [face(700)], id: TARGET_ID, name: 'Inter' };
const WRITTEN = { ...FAMILY, warnings: [] };
const USED = { faces: [], family_id: FAMILY_ID, flows: [{ flow_id: FLOW_ID, found_count: 2 }], paywalls: [] };
const UNUSED = { ...USED, flows: [] };

const upload = (result: string, faces: unknown[]) => ({
    created_faces: result === 'created' || result === 'added' ? faces : [],
    family: FAMILY,
    file_id: 7,
    file_name: 'x.otf',
    kept_faces: [],
    replaced_faces: result === 'replaced' ? faces : [],
    result,
    warnings: [],
});

const refusal = (code: string, message: string, status = 400, extra = {}) => ({
    body: { error_code: code, errors: { non_field_errors: [message] }, status_code: status, ...extra },
    status,
});

const CONFLICT = {
    choices: ['replace', 'keep'],
    conflict: { face_id: FACE_ID, family_id: FAMILY_ID, family_name: 'Brand', font_alias_ios: 'Brand-700', italic: false, weight: 700 },
};

const listRoute: Route = { answers: [{ body: { data: [FAMILY, TARGET] } }], method: 'GET', path: /\/media\/fonts\/$/ };
const usageRoute = (body: unknown = USED): Route => ({ answers: [{ body }], method: 'GET', path: /\/usage\/$/ });

const writes = (sent: readonly SentRequest[]): SentRequest[] => sent.filter(request => request.method !== 'GET');

const formFields = (body: unknown): Record<string, string> => {
    const form = body as FormData;
    const fields: Record<string, string> = {};

    form.forEach((value, key) => {
        fields[key] = typeof value === 'string' ? value : value.name;
    });

    return fields;
};

describe('fonts', () => {
    let dir: string;
    let stub: sinon.SinonStub | undefined;

    const fontFile = async (name: string): Promise<string> => {
        const path = join(dir, name);
        await writeFile(path, Buffer.from('OTTO'));

        return path;
    };

    const use = (routes: Route[]): SentRequest[] => {
        const fake = routeFetch(routes);
        stub = fake.stub;

        return fake.sent;
    };

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'adapty-fonts-'));
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(async () => {
        process.exitCode = undefined;
        stub?.restore();
        stub = undefined;
        delete process.env.ADAPTY_TOKEN;
        await rm(dir, { force: true, recursive: true });
    });

    /**
     * external: the success path of each command, as an agent runs it: exit 0, the request it
     * sends and the line it reads. A change of a family that a flow uses names that flow.
     */
    describe('each command', () => {
        type Row = {
            argv: (files: { bold: string }) => string;
            expectedOut: string[];
            id: string;
            routes: Route[];
            write?: { fields?: Record<string, string>; json?: unknown; method: string; path: string };
        };

        const rows: Row[] = [
            { argv: () => 'fonts list', expectedOut: ['Brand (', '400 italic'], id: 'list', routes: [listRoute] },
            {
                argv: () => `fonts get ${FAMILY_ID}`,
                expectedOut: ['Brand ('],
                id: 'get',
                routes: [{ answers: [{ body: FAMILY }], method: 'GET', path: new RegExp(`${FAMILY_ID}/$`) }],
            },
            {
                argv: ({ bold }) => `fonts upload ${bold}`,
                expectedOut: ['Brand-Bold.otf: created in Brand', '1 of 1 files done.'],
                id: 'upload',
                routes: [{ answers: [{ body: upload('created', [face(700)]), status: 201 }], method: 'POST', path: /\/media\/fonts\/$/ }],
                write: { fields: { file: 'Brand-Bold.otf' }, method: 'POST', path: FONTS },
            },
            {
                argv: ({ bold }) => `fonts add ${FAMILY_ID} ${bold}`,
                expectedOut: ['Brand-Bold.otf: added in Brand', `  ${FLOW_ID}`],
                id: 'add',
                routes: [{ answers: [{ body: upload('added', [face(700)]), status: 201 }], method: 'POST', path: /\/faces\/$/ }, usageRoute()],
                write: { fields: { file: 'Brand-Bold.otf' }, method: 'POST', path: `${FONTS}${FAMILY_ID}/faces/` },
            },
            {
                argv: () => `fonts rename ${FAMILY_ID} Brand`,
                expectedOut: ['These flows use the changed font and need a publish to get it:', `  ${FLOW_ID}`],
                id: 'rename',
                routes: [{ answers: [{ body: FAMILY }], method: 'PATCH', path: /fonts\/[\w-]+\/$/ }, usageRoute()],
                write: { json: { name: 'Brand' }, method: 'PATCH', path: `${FONTS}${FAMILY_ID}/` },
            },
            {
                argv: () => `fonts faces update ${FACE_ID} --weight 600 --italic false`,
                expectedOut: ['Brand ('],
                id: 'faces update',
                routes: [listRoute, { answers: [{ body: WRITTEN }], method: 'PATCH', path: /\/faces\/[\w-]+\/$/ }, usageRoute(UNUSED)],
                write: { json: { italic: false, weight: 600 }, method: 'PATCH', path: `${FONTS}${FAMILY_ID}/faces/${FACE_ID}/` },
            },
            {
                argv: () => `fonts faces default ${FACE_ID}`,
                expectedOut: ['Brand ('],
                id: 'faces default',
                routes: [listRoute, { answers: [{ body: WRITTEN }], method: 'PATCH', path: /\/faces\/[\w-]+\/$/ }, usageRoute(UNUSED)],
                write: { json: { is_default: true }, method: 'PATCH', path: `${FONTS}${FAMILY_ID}/faces/${FACE_ID}/` },
            },
            {
                argv: () => `fonts faces move ${FACE_ID} --to ${TARGET_ID}`,
                expectedOut: ['Inter ('],
                id: 'faces move',
                routes: [listRoute, { answers: [{ body: TARGET }], method: 'POST', path: /\/move\/$/ }, usageRoute(UNUSED)],
                write: { json: { target_font_family_id: TARGET_ID }, method: 'POST', path: `${FONTS}${FAMILY_ID}/faces/${FACE_ID}/move/` },
            },
            {
                argv: ({ bold }) => `fonts faces replace ${FACE_ID} ${bold}`,
                expectedOut: ['Brand ('],
                id: 'faces replace',
                routes: [listRoute, { answers: [{ body: WRITTEN }], method: 'PUT', path: /\/file\/$/ }, usageRoute(UNUSED)],
                write: { fields: { file: 'Brand-Bold.otf' }, method: 'PUT', path: `${FONTS}${FAMILY_ID}/faces/${FACE_ID}/file/` },
            },
            { argv: () => `fonts usage ${FAMILY_ID}`, expectedOut: [`  ${FLOW_ID}  2 uses`], id: 'usage', routes: [usageRoute()] },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const sent = use(row.routes);
                const bold = await fontFile('Brand-Bold.otf');

                const { error, stdout } = await runCommand(`${row.argv({ bold })} --app ${TEST_APP_ID}`);

                expect(error, row.id).to.equal(undefined);
                expect(process.exitCode ?? 0, row.id).to.equal(0);

                for (const line of row.expectedOut) {
                    expect(stdout, row.id).to.include(line);
                }

                const [write, ...more] = writes(sent);

                if (row.write === undefined) {
                    expect(write, `${row.id}: a read sends no write`).to.equal(undefined);

                    return;
                }

                expect(more, `${row.id}: one write`).to.deep.equal([]);
                expect(write?.method, row.id).to.equal(row.write.method);
                expect(write?.path, row.id).to.equal(row.write.path);

                if (row.write.json !== undefined) {
                    expect(write?.body, row.id).to.deep.equal(row.write.json);
                }

                if (row.write.fields !== undefined) {
                    expect(formFields(write?.body), row.id).to.deep.equal(row.write.fields);
                }
            });
        }
    });

    /** external: the per-file report and the exit code an agent acts on after a package. */
    describe('a package', () => {
        const packageRoutes = (): Route[] => [{
            answers: [
                { body: upload('created', [face(400)]), status: 201 },
                { body: upload('added', [face(700)]), status: 201 },
                { body: upload('added', [face(400, true)]), status: 201 },
                refusal('corrupted_font_file', 'The font file is corrupted.'),
                refusal('invalid_font_file', 'Invalid font file. Only .ttf and .otf files are allowed. Upload a .ttf or .otf file.'),
            ],
            method: 'POST',
            path: /\/media\/fonts\/$/,
        }, usageRoute(UNUSED)];

        const files = async (): Promise<string> =>
            (await Promise.all(['Regular.otf', 'Bold.otf', 'Italic.otf', 'broken.otf', 'font.woff2'].map(name => fontFile(name)))).join(' ');

        it('with a refused file reports every file and exits 4 (human)', async () => {
            const sent = use(packageRoutes());

            const { stdout } = await runCommand(`fonts upload ${await files()} --app ${TEST_APP_ID}`);

            expect(writes(sent)).to.have.length(5);
            expect(process.exitCode).to.equal(exitCode.api);
            expect(stdout).to.include('Regular.otf: created in Brand');
            expect(stdout).to.include('Italic.otf: added in Brand');
            expect(stdout).to.include('broken.otf: refused — corrupted_font_file: The font file is corrupted.');
            expect(stdout).to.include('font.woff2: refused — invalid_font_file: Invalid font file. Only .ttf and .otf files are allowed. Upload a .ttf or .otf file.');
            expect(stdout).to.include('3 of 5 files done, 2 refused.');
        });

        it('with --json is one parseable result per file, refusals with code and message, exit 4', async () => {
            use(packageRoutes());

            const { stdout } = await runCommand(`fonts upload ${await files()} --app ${TEST_APP_ID} --json`);
            type Report = { files: { error_code?: string; result: string }[]; flows_to_publish: unknown };

            const report = JSON.parse(stdout) as Report;

            expect(report.files.map(file => [file.result, file.error_code])).to.deep.equal([
                ['created', undefined],
                ['added', undefined],
                ['added', undefined],
                ['refused', 'corrupted_font_file'],
                ['refused', 'invalid_font_file'],
            ]);

            expect(report.flows_to_publish).to.deep.equal([]);
            expect(process.exitCode).to.equal(exitCode.api);
        });

        it('every file stored exits 0', async () => {
            use(packageRoutes());

            const paths = (await files()).split(' ').slice(0, 3).join(' ');
            const { error } = await runCommand(`fonts upload ${paths} --app ${TEST_APP_ID}`);

            expect(error).to.equal(undefined);
            expect(process.exitCode ?? 0).to.equal(0);
        });

        describe('a failure that is not about the file stops the package after the report of the files done', () => {
            const rows: { answer: RouteAnswer; code: string; exit: number; id: string }[] = [
                { answer: { network: true }, code: 'network_error', exit: exitCode.network, id: 'network: exit 5' },
                { answer: { body: { detail: 'Invalid token.' }, status: 401 }, code: 'auth_required', exit: exitCode.auth, id: '401: exit 3' },
                {
                    answer: { body: { errors: [{ code: 'permission_denied', detail: 'No access.' }] }, status: 403 },
                    code: 'permission_denied',
                    exit: exitCode.auth,
                    id: '403: exit 3',
                },
            ];

            for (const row of rows) {
                it(row.id, async () => {
                    const sent = use([{
                        answers: [{ body: upload('created', [face(400)]), status: 201 }, row.answer],
                        method: 'POST',
                        path: /\/media\/fonts\/$/,
                    }, usageRoute(UNUSED)]);

                    const { stdout } = await runCommand(`fonts upload ${await files()} --app ${TEST_APP_ID} --json`);
                    const report = JSON.parse(stdout) as { files: { error_code?: string; result: string }[] };

                    expect(report.files.map(file => file.result), row.id)
                        .to.deep.equal(['created', 'failed', 'not_sent', 'not_sent', 'not_sent']);

                    expect(report.files[1]?.error_code, row.id).to.equal(row.code);
                    expect(writes(sent), row.id).to.have.length(2);
                    expect(process.exitCode, row.id).to.equal(row.exit);
                });
            }
        });

        it('a file that cannot be read stops before any send, exit 2', async () => {
            const sent = use(packageRoutes());
            const missing = join(dir, 'missing.otf');

            const { error } = await runCommand(`fonts upload ${await fontFile('Regular.otf')} ${missing} --app ${TEST_APP_ID}`);

            expect(error?.message).to.equal(`Cannot read file: ${missing}`);
            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(sent).to.deep.equal([]);
        });
    });

    /** external: the next step of a refused upload names the flag that decides it. */
    it('a conflict names the colliding face and the --choice that repeats the upload', async () => {
        use([{ answers: [refusal('duplicate_custom_font_face', 'Taken.', 409, CONFLICT)], method: 'POST', path: /\/media\/fonts\/$/ }]);
        const bold = await fontFile('Bold.otf');

        const { stdout } = await runCommand(`fonts upload ${bold} --app ${TEST_APP_ID} --json`);
        const [file] = (JSON.parse(stdout) as { files: Record<string, unknown>[] }).files;

        expect(file).to.deep.include({ ...CONFLICT, error_code: 'duplicate_custom_font_face', result: 'refused', status_code: 409 });

        expect(file?.next_step).to.equal(`Run \`adapty fonts upload --app ${TEST_APP_ID} ${bold} --choice replace\` to put the file on face `
            + `${FACE_ID} of Brand, or \`adapty fonts upload --app ${TEST_APP_ID} ${bold} --choice keep\` to skip it.`);
    });

    /** external: --choice goes to the server as the form field `choice`. */
    it('--choice keep is sent with the file', async () => {
        const sent = use([{ answers: [{ body: upload('kept', []) }], method: 'POST', path: /\/media\/fonts\/$/ }]);

        await runCommand(`fonts upload ${await fontFile('Bold.otf')} --choice keep --app ${TEST_APP_ID}`);

        expect(formFields(writes(sent)[0]?.body)).to.deep.equal({ choice: 'keep', file: 'Bold.otf' });
    });

    /** external: after a saved change, a failed read of the flows is `null` and a warning, not "no flows". */
    it('a failed usage read after a change leaves flows_to_publish null', async () => {
        use([
            { answers: [{ body: FAMILY }], method: 'PATCH', path: /fonts\/[\w-]+\/$/ },
            { answers: [refusal('font_family_not_found', 'Not found.', 404)], method: 'GET', path: /\/usage\/$/ },
        ]);

        const json = await runCommand(`fonts rename ${FAMILY_ID} Brand --app ${TEST_APP_ID} --json`);
        const human = await runCommand(`fonts rename ${FAMILY_ID} Brand --app ${TEST_APP_ID}`);

        expect((JSON.parse(json.stdout) as { flows_to_publish: unknown }).flows_to_publish).to.equal(null);
        expect(human.stderr).to.include('The change is saved');
        expect(human.error).to.equal(undefined);
        expect(process.exitCode ?? 0).to.equal(0);
    });
});
