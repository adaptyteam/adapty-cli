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
// Hex letters in it, so the upper case of the id differs from the id
const FACE_ID = '3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c';
const FLOW_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_FACE_ID = '55555555-5555-4555-8555-555555555555';
const TARGET_FLOW_ID = '66666666-6666-4666-8666-666666666666';
const FONTS = `/api/v1/developer/apps/${TEST_APP_ID}/media/fonts/`;
const POST_FONTS = /\/media\/fonts\/$/;

type FaceOptions = {
    android?: string;
    familyId?: string;
    fileId?: number;
    id?: string;
    ios?: string;
    isDefault?: boolean;
    italic?: boolean;
    status?: string;
};

const face = (weight: number, options: FaceOptions = {}) => {
    const italic = options.italic ?? false;

    return {
        family_id: options.familyId ?? FAMILY_ID,
        file_format: 'otf',
        file_id: options.fileId ?? weight,
        file_url: 'https://cdn.example.com/brand.otf',
        font_alias_android: options.android ?? null,
        font_alias_ios: options.ios ?? `Brand-${weight}${italic ? 'i' : ''}`,
        id: options.id ?? (weight === 700 ? FACE_ID : `face-${weight}${italic ? 'i' : ''}`),
        is_default: options.isDefault ?? (weight === 400 && !italic),
        italic,
        metadata_status: options.status ?? 'detected',
        weight,
    };
};

type Face = ReturnType<typeof face>;

const FAMILY = {
    default_face_id: 'face-400',
    faces: [face(400), face(700), face(400, { italic: true })],
    id: FAMILY_ID,
    name: 'Brand',
};

const TARGET = {
    default_face_id: OTHER_FACE_ID,
    faces: [face(300, { familyId: TARGET_ID, id: OTHER_FACE_ID })],
    id: TARGET_ID,
    name: 'Inter',
};

/** The family after a write: these faces, and the warnings of a write. */
const written = (faces: Face[], extra: Record<string, unknown> = {}) => ({ ...FAMILY, faces, warnings: [], ...extra });

const usage = (familyId: string, flowIds: string[]) =>
    ({ faces: [], family_id: familyId, flows: flowIds.map(flow => ({ flow_id: flow, found_count: 2 })), paywalls: [] });

/** The usage of the named families; any other family is used by no flow. */
const usageRoutes = (used: Record<string, string[]> = {}): Route[] => [
    ...Object.entries(used).map(([familyId, flowIds]): Route => ({
        answers: [{ body: usage(familyId, flowIds) }],
        method: 'GET',
        path: new RegExp(`${familyId}/usage/$`),
    })),
    { answers: [{ body: usage(FAMILY_ID, []) }], method: 'GET', path: /\/usage\/$/ },
];

const BOTH_USED = { [FAMILY_ID]: [FLOW_ID], [TARGET_ID]: [TARGET_FLOW_ID] };

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

const collision = (faceId: string, weight: number, family = { id: FAMILY_ID, name: 'Brand' }) =>
    ({ face_id: faceId, family_id: family.id, family_name: family.name, font_alias_ios: `Brand-${weight}`, italic: false, weight });

/** A 409 of upload and add: every colliding face, the first one also as `conflict`. */
const collisions = (...faces: ReturnType<typeof collision>[]) =>
    ({ choices: ['replace', 'keep'], conflict: faces[0], conflicts: faces });

const TWO = collisions(collision(FACE_ID, 700), collision(OTHER_FACE_ID, 400));

const listRoute: Route = { answers: [{ body: { data: [FAMILY, TARGET] } }], method: 'GET', path: POST_FONTS };

const writes = (sent: readonly SentRequest[]): SentRequest[] => sent.filter(request => request.method !== 'GET');

/** The form as field → value; a repeated field is its values joined with a comma. */
const formFields = (body: unknown): Record<string, string> => {
    const form = body as FormData;
    const fields: Record<string, string> = {};

    form.forEach((value, key) => {
        const text = typeof value === 'string' ? value : value.name;

        fields[key] = fields[key] === undefined ? text : `${fields[key]},${text}`;
    });

    return fields;
};

/** The arguments as one command line: runCommand splits a line on spaces outside double quotes. */
const line = (args: readonly string[]): string => args.map(arg => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ');

const escaped = (text: string): RegExp => new RegExp(text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`));

type FileResult = Record<string, unknown> & { error_code?: string; message?: string; result: string };
type PackageJson = { files: FileResult[]; flows_to_publish: unknown; flows_to_publish_error?: { error_code: string } };

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
     * external: the success path of each command, as an agent runs it: exit 0, the request it sends and
     * what changed in what it prints. A change of a family that flows use names those flows, also of a
     * second family the change reaches (a move, a file shared by two families).
     */
    describe('each command', () => {
        type Row = {
            absent?: RegExp[];
            argv: (files: { bold: string }) => string[];
            id: string;
            out: RegExp[];
            routes: Route[];
            write?: { fields?: Record<string, string>; json?: unknown; method: string; path: string };
        };

        const facePath = `${FONTS}${FAMILY_ID}/faces/${FACE_ID}/`;
        const patchFace = (body: unknown): Route => ({ answers: [{ body }], method: 'PATCH', path: /\/faces\/[\w-]+\/$/ });
        const movedSibling = face(700, { familyId: TARGET_ID, fileId: 700, id: OTHER_FACE_ID });
        const sharedFile: Route = { answers: [{ body: { data: [FAMILY, { ...TARGET, faces: [movedSibling] }] } }], method: 'GET', path: POST_FONTS };

        const madeDefault = {
            default_face_id: FACE_ID,
            faces: [face(400, { isDefault: false }), face(700, { isDefault: true })],
        };

        const movedInto = { ...TARGET, faces: [...TARGET.faces, face(700, { familyId: TARGET_ID })] };

        const rows: Row[] = [
            { argv: () => ['fonts', 'list'], id: 'list', out: [/Brand \(/, /400 italic/], routes: [listRoute] },
            {
                argv: () => ['fonts', 'get', FAMILY_ID],
                id: 'get',
                out: [escaped(`Brand (${FAMILY_ID})`)],
                routes: [{ answers: [{ body: FAMILY }], method: 'GET', path: new RegExp(`${FAMILY_ID}/$`) }],
            },
            {
                argv: ({ bold }) => ['fonts', 'upload', bold],
                id: 'upload',
                out: [/Brand-Bold\.otf: created in Brand/, /1 of 1 files done\./],
                routes: [{ answers: [{ body: upload('created', [face(700)]), status: 201 }], method: 'POST', path: POST_FONTS }, ...usageRoutes()],
                write: { fields: { file: 'Brand-Bold.otf' }, method: 'POST', path: FONTS },
            },
            {
                argv: ({ bold }) => ['fonts', 'add', FAMILY_ID, bold],
                id: 'add',
                out: [/Brand-Bold\.otf: added in Brand[^\n]*: new faces 700/, escaped(`  ${FLOW_ID}`)],
                routes: [
                    { answers: [{ body: upload('added', [face(700)]), status: 201 }], method: 'POST', path: /\/faces\/$/ },
                    ...usageRoutes({ [FAMILY_ID]: [FLOW_ID] }),
                ],
                write: { fields: { file: 'Brand-Bold.otf' }, method: 'POST', path: `${FONTS}${FAMILY_ID}/faces/` },
            },
            {
                argv: () => ['fonts', 'rename', FAMILY_ID, 'Brand Sans'],
                id: 'rename',
                out: [escaped(`Brand Sans (${FAMILY_ID})`), /need a publish to get it:/, escaped(`  ${FLOW_ID}`)],
                routes: [
                    { answers: [{ body: { ...FAMILY, name: 'Brand Sans' } }], method: 'PATCH', path: /fonts\/[\w-]+\/$/ },
                    ...usageRoutes({ [FAMILY_ID]: [FLOW_ID] }),
                ],
                write: { json: { name: 'Brand Sans' }, method: 'PATCH', path: `${FONTS}${FAMILY_ID}/` },
            },
            {
                argv: () => ['fonts', 'faces', 'update', FACE_ID, '--weight', '600', '--italic', 'false'],
                id: 'faces update',
                out: [new RegExp(`${FACE_ID} +600 +\\S+ +\\S+ +confirmed`)],
                routes: [listRoute, patchFace(written([face(400), face(600, { id: FACE_ID, status: 'confirmed' })])), ...usageRoutes()],
                write: { json: { italic: false, weight: 600 }, method: 'PATCH', path: facePath },
            },
            {
                argv: () => ['fonts', 'faces', 'update', FACE_ID.toUpperCase(), '--android-name', 'brand_bold'],
                id: 'faces update: a face id in upper case; an Android name reaches every family of the file',
                out: [new RegExp(`${FACE_ID} +700 +Brand-700 +brand_bold`), escaped(`  ${FLOW_ID}`), escaped(`  ${TARGET_FLOW_ID}`)],
                routes: [sharedFile, patchFace(written([face(400), face(700, { android: 'brand_bold' })])), ...usageRoutes(BOTH_USED)],
                write: { json: { font_alias_android: 'brand_bold' }, method: 'PATCH', path: facePath },
            },
            {
                absent: [/face-400 [^\n]*default/],
                argv: () => ['fonts', 'faces', 'default', FACE_ID],
                id: 'faces default',
                out: [new RegExp(`${FACE_ID}[^\\n]*default`)],
                routes: [listRoute, patchFace(written([], madeDefault)), ...usageRoutes()],
                write: { json: { is_default: true }, method: 'PATCH', path: facePath },
            },
            {
                argv: () => ['fonts', 'faces', 'move', FACE_ID, '--to', TARGET_ID],
                id: 'faces move: the flows of the source and of the target family',
                out: [new RegExp(`Inter \\(${TARGET_ID}\\)\\n[^\\n]*\\n(?:[^\\n]*\\n)*${FACE_ID} +700`), escaped(`  ${FLOW_ID}`), escaped(`  ${TARGET_FLOW_ID}`)],
                routes: [listRoute, { answers: [{ body: movedInto }], method: 'POST', path: /\/move\/$/ }, ...usageRoutes(BOTH_USED)],
                write: { json: { target_font_family_id: TARGET_ID }, method: 'POST', path: `${facePath}move/` },
            },
            {
                argv: ({ bold }) => ['fonts', 'faces', 'replace', FACE_ID, bold],
                id: 'faces replace',
                out: [new RegExp(`${FACE_ID} +700 +Brand-Bold-New`)],
                routes: [listRoute, { answers: [{ body: written([face(400), face(700, { fileId: 8, ios: 'Brand-Bold-New' })]) }], method: 'PUT', path: /\/file\/$/ }, ...usageRoutes()],
                write: { fields: { file: 'Brand-Bold.otf' }, method: 'PUT', path: `${facePath}file/` },
            },
            {
                argv: () => ['fonts', 'usage', FAMILY_ID],
                id: 'usage',
                out: [escaped(`  ${FLOW_ID}  2 uses`)],
                routes: usageRoutes({ [FAMILY_ID]: [FLOW_ID] }),
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const sent = use(row.routes);
                const bold = await fontFile('Brand-Bold.otf');

                const { error, stdout } = await runCommand(line([...row.argv({ bold }), '--app', TEST_APP_ID]));

                expect(error, row.id).to.equal(undefined);
                expect(process.exitCode ?? 0, row.id).to.equal(0);

                for (const line of row.out) {
                    expect(stdout, row.id).to.match(line);
                }

                for (const line of row.absent ?? []) {
                    expect(stdout, row.id).not.to.match(line);
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

    /**
     * external: the per-file report and the exit code an agent acts on after a package. A file the server
     * refuses does not stop the rest; a network or auth failure, and a success answer the CLI cannot read
     * (the file may be stored), stop it after the report of the files done.
     */
    describe('a package', () => {
        const NAMES = ['Regular.otf', 'Bold.otf', 'Italic.otf', 'broken.otf', 'font.woff2'];
        const invalid = 'Invalid font file. Only .ttf and .otf files are allowed. Upload a .ttf or .otf file.';
        const { warnings: _, ...unreadable } = upload('added', [face(700)]);

        const MIXED: RouteAnswer[] = [
            { body: upload('created', [face(400)]), status: 201 },
            { body: upload('added', [face(700)]), status: 201 },
            { body: upload('added', [face(400, { italic: true })]), status: 201 },
            refusal('corrupted_font_file', 'The font file is corrupted.'),
            refusal('invalid_font_file', invalid),
        ];

        const stopAfterOne = (answer: RouteAnswer): RouteAnswer[] => [{ body: upload('created', [face(400)]), status: 201 }, answer];

        const stopped = (code: string): [string, string | undefined][] =>
            [['created', undefined], ['failed', code], ['not_sent', undefined], ['not_sent', undefined], ['not_sent', undefined]];

        type Row = {
            answers: RouteAnswer[];
            exit: number;
            files: number;
            human?: string[];
            id: string;
            message?: string;
            results?: [string, string | undefined][];
            /** Lines of the warning on stderr. */
            stderr?: string[];
            /** The flows to publish are unknown, with this error code. */
            unknownFlows?: string;
            writes: number;
        };

        const rows: Row[] = [
            {
                answers: MIXED,
                exit: exitCode.api,
                files: 5,
                human: [
                    'Regular.otf: created in Brand',
                    'Italic.otf: added in Brand',
                    'broken.otf: refused — corrupted_font_file: The font file is corrupted.',
                    `font.woff2: refused — invalid_font_file: ${invalid}`,
                    '3 of 5 files done, 2 refused.',
                ],
                id: 'a refused file: every file reported, exit 4 (human)',
                writes: 5,
            },
            {
                answers: MIXED,
                exit: exitCode.api,
                files: 5,
                id: 'a refused file: one parseable result per file, exit 4 (--json)',
                results: [
                    ['created', undefined],
                    ['added', undefined],
                    ['added', undefined],
                    ['refused', 'corrupted_font_file'],
                    ['refused', 'invalid_font_file'],
                ],
                writes: 5,
            },
            {
                answers: MIXED,
                exit: 0,
                files: 3,
                id: 'every file stored: exit 0',
                results: [['created', undefined], ['added', undefined], ['added', undefined]],
                writes: 3,
            },
            {
                answers: stopAfterOne({ network: true }),
                exit: exitCode.network,
                files: 5,
                id: 'network: stops, the file may be stored, the flows are unknown, exit 5',
                message: 'The file may be stored',
                results: stopped('network_error'),
                unknownFlows: 'network_error',
                writes: 2,
            },
            {
                answers: stopAfterOne({ lostBody: true, status: 201 }),
                exit: exitCode.network,
                files: 5,
                id: 'a 201 whose body is lost: stops, the file may be stored, the flows are unknown, exit 5',
                message: 'The file may be stored',
                results: stopped('network_error'),
                unknownFlows: 'network_error',
                writes: 2,
            },
            {
                answers: stopAfterOne({ body: { detail: 'Invalid token.' }, status: 401 }),
                exit: exitCode.auth,
                files: 5,
                id: '401: stops, exit 3',
                results: stopped('auth_required'),
                unknownFlows: 'auth_required',
                writes: 2,
            },
            {
                answers: stopAfterOne({ body: { errors: [{ code: 'permission_denied', detail: 'No access.' }] }, status: 403 }),
                exit: exitCode.auth,
                files: 5,
                id: '403: stops, exit 3',
                results: stopped('permission_denied'),
                unknownFlows: 'permission_denied',
                writes: 2,
            },
            {
                answers: stopAfterOne({ body: unreadable, status: 201 }),
                exit: exitCode.api,
                files: 5,
                id: 'a success without warnings: stops, says the file may be stored, exit 4',
                message: 'The file may be stored',
                results: stopped('malformed_response'),
                unknownFlows: 'malformed_response',
                writes: 2,
            },
            {
                answers: stopAfterOne({ body: unreadable, status: 201 }),
                exit: exitCode.api,
                files: 5,
                human: ['Bold.otf: failed', 'The file may be stored', 'Bold.otf: failed'],
                id: 'a success without warnings (human): the recovery step names fonts list, then fonts usage',
                stderr: ['are not known', `adapty fonts list --app ${TEST_APP_ID}`, `adapty fonts usage --app ${TEST_APP_ID} FAMILY_ID`],
                writes: 2,
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const sent = use([{ answers: row.answers, method: 'POST', path: POST_FONTS }, ...usageRoutes()]);
                const paths = await Promise.all(NAMES.slice(0, row.files).map(name => fontFile(name)));
                const json = row.human === undefined ? ['--json'] : [];

                const { stderr, stdout } = await runCommand(['fonts', 'upload', ...paths, '--app', TEST_APP_ID, ...json]);

                expect(writes(sent), row.id).to.have.length(row.writes);

                for (const line of row.stderr ?? []) {
                    expect(stderr.replaceAll(/\s*\n\s*›?\s*/g, ' '), row.id).to.include(line);
                }

                expect(process.exitCode ?? 0, row.id).to.equal(row.exit);

                for (const line of row.human ?? []) {
                    expect(stdout, row.id).to.include(line);
                }

                if (row.results !== undefined) {
                    const report = JSON.parse(stdout) as PackageJson;
                    const { files } = report;

                    expect(files.map(file => [file.result, file.error_code]), row.id).to.deep.equal(row.results);

                    if (row.message !== undefined) {
                        expect(files.find(file => file.result === 'failed')?.message, row.id).to.include(row.message);
                    }

                    if (row.unknownFlows !== undefined) {
                        expect(report.flows_to_publish, row.id).to.equal(null);
                        expect(report.flows_to_publish_error?.error_code, row.id).to.equal(row.unknownFlows);
                    }
                }
            });
        }

        it('a file that cannot be read stops before any send, exit 2', async () => {
            const sent = use([{ answers: MIXED, method: 'POST', path: POST_FONTS }]);
            const missing = join(dir, 'missing.otf');

            const { error } = await runCommand(`fonts upload ${await fontFile('Regular.otf')} ${missing} --app ${TEST_APP_ID}`);

            expect(error?.message).to.equal(`Cannot read file: ${missing}`);
            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(sent).to.deep.equal([]);
        });
    });

    /**
     * external: a collision as the agent meets it. The refusal lists every colliding face and names the
     * --choice that decides it, with the file as one shell word; `--choice replace` sends the file without
     * a choice first and, on a 409 that lists the collisions, once more with `replace` and every listed
     * face; never a loop. The flows of every family whose face was replaced need a publish.
     */
    describe('a collision', () => {
        const replaced = { ...upload('replaced', [face(700), face(400)]), result: 'replaced' };
        const replacedAndAdded = { ...upload('added', [face(300)]), replaced_faces: [face(700), face(400)] };
        const nothingLeft = 'The file collides with no stored face now, so `choice` `replace` has nothing to replace.';
        const retried = { choice: 'replace', file: 'Bold.otf', replace_face_ids: `${FACE_ID},${OTHER_FACE_ID}` };
        const crossFamily = collisions(collision(FACE_ID, 700), collision(OTHER_FACE_ID, 700, { id: TARGET_ID, name: 'Inter' }));
        const crossReplaced = { ...upload('replaced', [face(700), face(700, { familyId: TARGET_ID, id: OTHER_FACE_ID })]), family: null };
        const firstOnly = { choices: ['replace', 'keep'], conflict: collision(FACE_ID, 700) };
        const allTaken = 'Every face of this file is in the family already. Replace the file of a face with `adapty fonts faces replace`.';

        type Row = {
            answers: RouteAnswer[];
            choice?: string;
            exit: number;
            file?: string;
            flows?: string[];
            human?: string[];
            id: string;
            report?: Record<string, unknown>;
            sent: Record<string, string>[];
        };

        const rows: Row[] = [
            {
                answers: [refusal('duplicate_custom_font_face', 'Taken.', 409, TWO)],
                exit: exitCode.api,
                id: 'no choice: refused with every colliding face',
                report: { ...TWO, error_code: 'duplicate_custom_font_face', result: 'refused', status_code: 409 },
                sent: [{ file: 'Bold.otf' }],
            },
            {
                answers: [refusal('duplicate_custom_font_face', 'Taken.', 409, TWO)],
                exit: exitCode.api,
                file: 'Brand Bold.otf',
                human: [
                    `  collides with face ${FACE_ID} (700, iOS name Brand-700) of Brand`,
                    `  collides with face ${OTHER_FACE_ID} (400, iOS name Brand-400) of Brand`,
                    'to put the file on all 2 of those faces, or',
                    '/Brand Bold.otf\' --choice keep` to skip it.',
                ],
                id: 'the human report: every colliding face, and a next step that quotes a file name with a space',
                sent: [{ file: 'Brand Bold.otf' }],
            },
            {
                answers: [{ body: upload('kept', []) }],
                choice: 'keep',
                exit: 0,
                id: '--choice keep goes in one request',
                report: { result: 'kept' },
                sent: [{ choice: 'keep', file: 'Bold.otf' }],
            },
            {
                answers: [refusal('duplicate_custom_font_face', 'Taken.', 409, TWO), { body: replaced }],
                choice: 'replace',
                exit: 0,
                id: '--choice replace with two collisions replaces both (200)',
                report: { replaced_faces: [face(700), face(400)], result: 'replaced' },
                sent: [{ file: 'Bold.otf' }, retried],
            },
            {
                answers: [refusal('duplicate_custom_font_face', 'Taken.', 409, TWO), { body: replacedAndAdded, status: 201 }],
                choice: 'replace',
                exit: 0,
                id: '--choice replace that also creates faces is a success too (201)',
                report: { created_faces: [face(300)], replaced_faces: [face(700), face(400)], result: 'added' },
                sent: [{ file: 'Bold.otf' }, retried],
            },
            {
                answers: [refusal('font_ios_alias_already_exists', 'Taken.', 409, crossFamily), { body: crossReplaced }],
                choice: 'replace',
                exit: 0,
                flows: [FLOW_ID, TARGET_FLOW_ID],
                id: '--choice replace across two families: the flows of both need a publish',
                report: { family: null, result: 'replaced' },
                sent: [{ file: 'Bold.otf' }, retried],
            },
            {
                answers: [refusal('duplicate_custom_font_face', 'Taken.', 409, firstOnly), { body: replaced }],
                choice: 'replace',
                exit: 0,
                id: '--choice replace on a server that sends only the first conflict: retried with that face',
                report: { result: 'replaced' },
                sent: [{ file: 'Bold.otf' }, { choice: 'replace', file: 'Bold.otf', replace_face_ids: FACE_ID }],
            },
            {
                answers: [
                    refusal('duplicate_custom_font_face', 'Taken.', 409, TWO),
                    refusal('duplicate_custom_font_face', 'Taken again.', 409, collisions(collision(FACE_ID, 700))),
                ],
                choice: 'replace',
                exit: exitCode.api,
                id: '--choice replace whose collisions changed before the retry: refused with the new ones, no loop',
                report: { ...collisions(collision(FACE_ID, 700)), message: 'Taken again.', result: 'refused' },
                sent: [{ file: 'Bold.otf' }, retried],
            },
            {
                answers: [refusal('duplicate_custom_font_face', 'Taken.', 409, TWO), refusal('base_error', nothingLeft)],
                choice: 'replace',
                exit: exitCode.api,
                id: '--choice replace with nothing left to replace: refused with the 400',
                report: { error_code: 'base_error', message: nothingLeft, result: 'refused', status_code: 400 },
                sent: [{ file: 'Bold.otf' }, retried],
            },
            {
                answers: [refusal('font_faces_already_exist', 'Every pair is taken.', 409)],
                choice: 'replace',
                exit: exitCode.api,
                id: '--choice replace on a refusal with no face to replace: no retry, the next step is faces replace',
                report: { error_code: 'font_faces_already_exist', next_step: allTaken, result: 'refused' },
                sent: [{ file: 'Bold.otf' }],
            },
            {
                answers: [{ body: upload('created', [face(700)]), status: 201 }],
                choice: 'replace',
                exit: 0,
                id: '--choice replace with no collision: one request, no choice',
                report: { result: 'created' },
                sent: [{ file: 'Bold.otf' }],
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const sent = use([{ answers: row.answers, method: 'POST', path: POST_FONTS }, ...usageRoutes(BOTH_USED)]);
                const path = await fontFile(row.file ?? 'Bold.otf');
                const choice = row.choice === undefined ? [] : ['--choice', row.choice];
                const json = row.human === undefined ? ['--json'] : [];

                const { stdout } = await runCommand(line(['fonts', 'upload', path, ...choice, '--app', TEST_APP_ID, ...json]));

                expect(writes(sent).map(request => formFields(request.body)), row.id).to.deep.equal(row.sent);
                expect(process.exitCode ?? 0, row.id).to.equal(row.exit);

                for (const line of row.human ?? []) {
                    expect(stdout, row.id).to.include(line);
                }

                if (row.human === undefined) {
                    const report = JSON.parse(stdout) as PackageJson;

                    expect(report.files[0], row.id).to.deep.include(row.report ?? {});

                    if (row.flows !== undefined) {
                        expect(report.flows_to_publish, row.id).to.deep.equal(row.flows);
                    }
                }
            });
        }
    });

    /**
     * external: after a saved change, a failed read of the flows is `null`, never "no flows"; the reason is
     * in the answer under --json and on stderr. A usage answer without its lists exits 4.
     */
    describe('the flows of a saved change cannot be read', () => {
        const notFound = refusal('font_family_not_found', 'Not found.', 404);
        const noFlows: RouteAnswer = { body: { faces: [], family_id: FAMILY_ID, paywalls: [] } };

        const rows: { answer: RouteAnswer; code: string; exit: number; id: string; json: boolean }[] = [
            { answer: notFound, code: 'font_family_not_found', exit: 0, id: 'a refused read (human)', json: false },
            { answer: notFound, code: 'font_family_not_found', exit: 0, id: 'a refused read (--json)', json: true },
            { answer: noFlows, code: 'malformed_response', exit: exitCode.api, id: 'an answer without flows (--json): exit 4', json: true },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                use([
                    { answers: [{ body: FAMILY }], method: 'PATCH', path: /fonts\/[\w-]+\/$/ },
                    { answers: [row.answer], method: 'GET', path: /\/usage\/$/ },
                ]);

                const json = row.json ? ['--json'] : [];
                const { error, stderr, stdout } = await runCommand(['fonts', 'rename', FAMILY_ID, 'Brand', '--app', TEST_APP_ID, ...json]);

                expect(error, row.id).to.equal(undefined);
                expect(stderr, row.id).to.include('The change is saved');
                expect(process.exitCode ?? 0, row.id).to.equal(row.exit);

                if (row.json) {
                    type Answer = { flows_to_publish: unknown; flows_to_publish_error: { error_code: string } };

                    const answer = JSON.parse(stdout) as Answer;

                    expect(answer.flows_to_publish, row.id).to.equal(null);
                    expect(answer.flows_to_publish_error.error_code, row.id).to.equal(row.code);
                }
            });
        }
    });
});
