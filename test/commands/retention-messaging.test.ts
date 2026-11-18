import { deflateSync, inflateSync } from 'node:zlib';

import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { restoreFetch } from '../helpers/mock-fetch.js';
import { encodePng, opaquePng, withBadCrc, withIdat } from '../helpers/png.js';
import {
    APP,
    BASE,
    defaultMessage,
    MESSAGE,
    runCli,
    sent,
    serve,
    tempFolder,
    useStreams,
    writes,
} from '../helpers/retention-messaging.js';

import type { Answer } from '../helpers/retention-messaging.js';
import type * as sinon from 'sinon';

const PRODUCT = '770e8400-e29b-41d4-a716-446655440002';

const MESSAGE_FILE = JSON.stringify({ body: 'Body', name: 'Winter', title: 'Title', type: 'default' });

const setupStatus = (production: string) => ({
    credentials: 'present',
    production: { realtime_url_status: production },
    registration_status: 'registered',
    sandbox: { performance_test_status: 'passed', realtime_url_status: 'not_configured' },
});

const ICON = 1024;

/** An icon with one pixel that differs: at the far corner, so the whole image is read before it. */
const iconWith = (spec: Omit<Parameters<typeof encodePng>[0], 'height' | 'pixel' | 'width'>, base: number[], odd: number[]) =>
    encodePng({ ...spec, height: ICON, pixel: (x, y) => (x === ICON - 1 && y === ICON - 1 ? odd : base), width: ICON });

describe('retention-messaging', () => {
    let fetchStub: sinon.SinonStub | undefined;
    let restoreStreams: () => void;
    let files: Awaited<ReturnType<typeof tempFolder>>;

    beforeEach(async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        restoreStreams = useStreams({ terminal: false });
        files = await tempFolder();
    });

    afterEach(async () => {
        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        restoreStreams();
        await files.remove();
        delete process.env.ADAPTY_TOKEN;
    });

    // external: the route, method, query and body that each read command and the test start send to the server
    describe('each command without a question sends its request', () => {
        type Row = { args: string[]; method: string; path: string; query?: Record<string, string> };

        const rows: Row[] = [
            { args: ['setup-status'], method: 'GET', path: `${BASE}/setup-status/` },
            { args: ['realtime-url', 'get'], method: 'GET', path: `${BASE}/realtime-url/` },
            { args: ['performance-test', 'start'], method: 'POST', path: `${BASE}/performance-test/start/` },
            {
                args: ['messages', 'list', '--mode', 'production', '--state', 'live', '--type', 'promo', '--search', 'Win', '--ordering', '-name'],
                method: 'GET',
                path: `${BASE}/messages/`,
                query: { 'filter[search]': 'Win', 'filter[state]': 'live', 'filter[type]': 'promo', 'mode': 'production', 'ordering': '-name' },
            },
            { args: ['messages', 'get', MESSAGE], method: 'GET', path: `${BASE}/messages/${MESSAGE}/` },
            {
                args: ['products', 'suggest', '--mode', 'sandbox', '--type', 'default', '--message-id', MESSAGE, '--limit', '5'],
                method: 'GET',
                path: `${BASE}/products/suggest/`,
                query: { limit: '5', message_id: MESSAGE, mode: 'sandbox', type: 'default' },
            },
            {
                args: ['promo-offers', 'suggest', PRODUCT, '--search', 'half'],
                method: 'GET',
                path: `${BASE}/products/${PRODUCT}/promo-offers/suggest/`,
                query: { search: 'half' },
            },
            { args: ['plan-switches', 'suggest', PRODUCT], method: 'GET', path: `${BASE}/products/${PRODUCT}/plan-switches/suggest/` },
        ];

        for (const row of rows) {
            it(row.args.slice(0, 2).join(' '), async () => {
                const answer: Answer = row.method === 'POST' ? { status: 204 } : { body: { data: [], meta: { pagination: { count: 0, page: 1, pages: 1 } } } };

                fetchStub = serve([answer]);

                const { error } = await runCli(['retention-messaging', ...row.args, '--app', APP]);
                const requests = sent(fetchStub);

                expect(error, 'error').to.equal(undefined);
                expect(requests.map(({ method, path }) => `${method} ${path}`)).to.deep.equal([`${row.method} ${row.path}`]);
                expect(Object.fromEntries(requests[0]?.query ?? []), 'query').to.include(row.query ?? {});

                if (row.method === 'POST') {
                    expect(JSON.parse(String(requests[0]?.body)), 'body').to.deep.equal({ mode: 'sandbox' });
                }
            });
        }
    });

    // external: with no terminal and no --yes, exit 6 with the effect, and no write is sent
    describe('create, set-status and configure need a yes in both modes', () => {
        const rows: { answers: Answer[]; args: () => Promise<string[]>; effect: string; reads: string[] }[] = [
            {
                answers: [],
                args: async () => ['messages', 'create', '--mode', 'sandbox', '--file', await files.write('m.json', MESSAGE_FILE)],
                effect: 'Create retention message "Winter" in sandbox.',
                reads: [],
            },
            {
                answers: [],
                args: async () => ['messages', 'create', '--mode', 'production', '--file', await files.write('m.json', MESSAGE_FILE)],
                effect: 'Create retention message "Winter" in production.',
                reads: [],
            },
            {
                answers: [],
                args: () => Promise.resolve(['messages', 'set-status', MESSAGE, '--action', 'deactivate']),
                effect: `Deactivate retention message ${MESSAGE}.`,
                reads: [],
            },
            {
                answers: [{ body: setupStatus('not_configured') }],
                args: () => Promise.resolve(['realtime-url', 'configure', '--mode', 'sandbox']),
                effect: 'Set the Adapty realtime URL in Apple for sandbox.',
                reads: [`GET ${BASE}/setup-status/`],
            },
        ];

        for (const row of rows) {
            it(row.effect, async () => {
                fetchStub = serve(row.answers);

                const { error } = await runCli(['retention-messaging', ...await row.args(), '--app', APP]);

                expect(error?.oclif?.exit, 'exit').to.equal(exitCode.confirmRequired);
                expect(error?.message).to.contain(row.effect).and.to.contain('Re-run with --yes to do it.');
                expect(sent(fetchStub).map(({ method, path }) => `${method} ${path}`), 'requests').to.deep.equal(row.reads);
            });
        }
    });

    // external: the replacement of the realtime URL of another server needs its own flag or a person's yes
    describe('realtime-url configure over the URL of another server', () => {
        const configure = ['retention-messaging', 'realtime-url', 'configure', '--app', APP, '--mode', 'production'];

        type Row = { exit?: number; extra: string[]; id: string; posts: number; prompt: boolean; terminal?: string };

        const rows: Row[] = [
            { exit: exitCode.confirmRequired, extra: ['--yes'], id: '(a) no terminal, --yes', posts: 0, prompt: false },
            { extra: ['--replace-other-url', '--yes'], id: '(b) no terminal, --replace-other-url --yes', posts: 1, prompt: false },
            { extra: [], id: '(c) terminal, "y"', posts: 1, prompt: true, terminal: 'y' },
            { exit: 1, extra: [], id: '(d) terminal, "n"', posts: 0, prompt: true, terminal: 'n' },
            { extra: ['--yes'], id: '(e) terminal, --yes, "y"', posts: 1, prompt: true, terminal: 'y' },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                fetchStub = serve([{ body: setupStatus('configured_to_other_url') }, { status: 204 }]);

                const restore = row.terminal === undefined
                    ? () => undefined
                    : useStreams({ terminal: true, typed: row.terminal });

                let result: Awaited<ReturnType<typeof runCli>>;

                try {
                    result = await runCli([...configure, ...row.extra]);
                } finally {
                    restore();
                }

                const posts = writes(fetchStub);
                const shown = `${result.error?.message ?? ''}${result.stderr}`;

                expect(result.error?.oclif?.exit, 'exit').to.equal(row.exit);
                expect(posts.length, 'POST configure').to.equal(row.posts);
                expect(posts.map(post => JSON.parse(String(post.body)) as unknown), 'body').to.deep.equal(posts.map(() => ({ mode: 'production' })));

                if (row.id !== rows[1]?.id) {
                    expect(shown, 'warning').to.contain('in production, Apple now has the realtime URL of another server')
                        .and.to.contain('replaced with the Adapty URL');
                }

                expect(result.stderr.includes('Apply? [y/N]'), 'question').to.equal(row.prompt);
            });
        }
    });

    // external: a file that breaks a rule is refused with exit 2, its name and the rule,
    // before any request
    describe('the images are checked before anything is sent', () => {
        type Row = { file: () => Uint8Array; header?: boolean; id: string; rule?: string };

        const rgba = { bitDepth: 8, colorType: 6 };

        const rows: Row[] = [
            { file: () => opaquePng(3000, 200), header: true, id: 'header 3000 px wide', rule: 'must be 3840 px wide and 160–2160 px tall' },
            { file: () => opaquePng(1000, 1000), id: 'icon 1000 × 1000', rule: 'must be 1024 × 1024 px' },
            { file: () => iconWith(rgba, [9, 9, 9, 255], [9, 9, 9, 0]), id: 'RGBA with one transparent pixel', rule: 'must have no transparency' },
            {
                file: () => encodePng({
                    bitDepth: 2,
                    colorType: 3,
                    height: ICON,
                    palette: [[0, 0, 0], [255, 255, 255]],
                    pixel: (x, y) => [x === 600 && y === 700 ? 1 : 0],
                    trns: [255, 0],
                    width: ICON,
                }),
                id: 'palette with tRNS',
                rule: 'must have no transparency',
            },
            { file: () => iconWith({ bitDepth: 8, colorType: 2, trns: [0, 10, 0, 20, 0, 30] }, [1, 2, 3], [10, 20, 30]), id: 'color key tRNS', rule: 'must have no transparency' },
            { file: () => iconWith({ bitDepth: 16, colorType: 6 }, [1, 2, 3, 65_535], [1, 2, 3, 0x7f_ff]), id: 'RGBA 16 bit with transparency', rule: 'must have no transparency' },
            { file: () => iconWith({ ...rgba, interlaced: true }, [9, 9, 9, 255], [9, 9, 9, 10]), id: 'Adam7 with transparency', rule: 'must have no transparency' },
            { file: () => new TextEncoder().encode('GIF89a not a png'), id: 'not a PNG', rule: 'must be a PNG' },
            { file: () => withIdat(opaquePng(ICON, ICON), data => data.subarray(0, data.length / 2)), id: 'RGB with a cut zlib stream', rule: 'must be a PNG' },
            { file: () => withBadCrc(opaquePng(ICON, ICON)), id: 'RGB with a wrong CRC', rule: 'must be a PNG' },
            {
                file: () => withIdat(opaquePng(ICON, ICON), data => deflateSync(inflateSync(data).subarray(0, -100))),
                id: 'RGB with short scanlines',
                rule: 'must be a PNG',
            },
            { file: () => new Uint8Array(10 * 1024 * 1024 + 1), id: 'larger than 10 MB', rule: 'must be at most 10 MB' },
            { file: () => iconWith(rgba, [9, 9, 9, 255], [200, 9, 9, 255]), id: 'opaque RGBA, every alpha 255' },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                fetchStub = serve([{ body: { data: defaultMessage() }, status: 201 }]);

                const image = await files.write('picture.png', row.file());

                const body = row.header === true
                    ? MESSAGE_FILE
                    : JSON.stringify({ ...JSON.parse(MESSAGE_FILE) as object, bullet_points: [{ image_path: 'picture.png', text: 'One' }] });

                const file = await files.write('m.json', body);
                const args = ['retention-messaging', 'messages', 'create', '--app', APP, '--mode', 'sandbox', '--file', file, '--yes'];
                const { error, stderr } = await runCli(row.header === true ? [...args, '--image', image] : args);

                expect(stderr, 'question').not.to.contain('Apply?');

                if (row.rule === undefined) {
                    expect(error, 'error').to.equal(undefined);
                    expect(writes(fetchStub).length, 'POST').to.equal(1);

                    return;
                }

                expect(error?.oclif?.exit, 'exit').to.equal(exitCode.usage);
                expect(error?.message).to.contain(`picture.png: ${row.rule}`);
                expect(fetchStub.callCount, 'requests').to.equal(0);
            });
        }

        it('a create file with image_index is refused', async () => {
            fetchStub = serve([]);

            const file = await files.write('m.json', JSON.stringify({ ...JSON.parse(MESSAGE_FILE) as object, bullet_points: [{ image_index: 0, text: 'One' }] }));
            const { error } = await runCli(['retention-messaging', 'messages', 'create', '--app', APP, '--mode', 'sandbox', '--file', file, '--yes']);

            expect(error?.oclif?.exit, 'exit').to.equal(exitCode.usage);
            expect(error?.message).to.contain('bullet_points[0].image_index is not allowed');
            expect(fetchStub.callCount, 'requests').to.equal(0);
        });
    });

    // external: a lost answer of a create or an update is never sent again, and says what to do instead
    describe('a lost answer to a write', () => {
        type Row = {
            answers: Answer[];
            args: () => Promise<string[]>;
            exit: number;
            id: string;
            name?: string;
            texts: string[];
        };

        const rows: Row[] = [
            ...(['network', { body: {}, status: 503 }] as const).map((failure, index) => ({
                answers: [failure],
                args: async () => ['messages', 'create', '--mode', 'sandbox', '--file', await files.write('m.json', MESSAGE_FILE), '--yes'],
                exit: index === 0 ? exitCode.network : exitCode.api,
                id: `create, ${index === 0 ? 'network error' : '503'}`,
                name: 'Winter',
                texts: ['The result is unknown', 'Do not repeat the create', `messages list --app ${APP} --mode sandbox --search <name>`, '\nMessage name: Winter'],
            })),
            {
                answers: ['network'],
                args: async () => ['messages', 'create', '--mode', 'sandbox', '--yes', '--file', await files.write('m.json', JSON.stringify({
                    ...JSON.parse(MESSAGE_FILE) as object,
                    name: 'It\'s "$(date)"',
                }))],
                exit: exitCode.network,
                id: 'create, a name with quotes and $( ) is only on its own line',
                name: 'It\'s "$(date)"',
                texts: ['--search <name>`', '\nMessage name: It\'s "$(date)"'],
            },
            ...(['network', { body: {}, status: 503 }] as const).map((failure, index) => ({
                answers: [{ body: { data: defaultMessage() } }, failure],
                args: () => Promise.resolve(['messages', 'update', MESSAGE, '--title', 'New', '--yes']),
                exit: index === 0 ? exitCode.network : exitCode.api,
                id: `update, ${index === 0 ? 'network error' : '503'}`,
                texts: ['The result is unknown', 'Do not repeat the update', `messages get ${MESSAGE} --app ${APP}`],
            })),
        ];

        for (const row of rows) {
            it(row.id, async () => {
                fetchStub = serve(row.answers);

                const { error } = await runCli(['retention-messaging', ...await row.args(), '--app', APP]);

                expect(writes(fetchStub).length, 'writes sent').to.equal(1);
                expect(error?.oclif?.exit, 'exit').to.equal(row.exit);

                for (const text of row.texts) {
                    expect(error?.message, text).to.contain(text);
                }

                if (row.name !== undefined) {
                    const lines = (error?.message ?? '').split('\n').filter(line => line.includes(row.name ?? ''));

                    expect(lines, 'the name only on its own line').to.deep.equal([`Message name: ${row.name}`]);
                    expect((error as unknown as { json: Record<string, unknown> }).json.message_name, 'message_name').to.equal(row.name);
                }
            });
        }
    });
});
