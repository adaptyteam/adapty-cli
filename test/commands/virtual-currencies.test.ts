import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { restoreFetch } from '../helpers/mock-fetch.js';
import { APP, runCli, sent, serve, tempFolder, useStreams, writes } from '../helpers/retention-messaging.js';

import type { Answer, Sent } from '../helpers/retention-messaging.js';
import type * as sinon from 'sinon';

/** The writes of the `virtual-currencies` topic: the question, the token, the bodies and the exit codes. */

const CURRENCY = '880e8400-e29b-41d4-a716-446655440003';
const P1 = '990e8400-e29b-41d4-a716-446655440011';
const P2 = '990e8400-e29b-41d4-a716-446655440012';
const P3 = '990e8400-e29b-41d4-a716-446655440013';
/** A product with no mapping in the read. */
const P4 = '990e8400-e29b-41d4-a716-446655440014';
const PATH = `/apps/${APP}/virtual-currencies/${CURRENCY}/`;

const oneTime = (productId: string, credit: number) =>
    ({ credit_per_purchase: credit, product_id: productId, product_type: 'one-time' });

const subscription = (productId: string, trial: null | number) =>
    ({ credit_on_trial_start: trial, credit_per_cycle: 20, expiring: false, product_id: productId, product_type: 'subscription' });

/** The read of the currency: `updated_at` 7, description "old", P1 = 30, P2 = 10 and the subscription P3. */
const currency = (overrides: Record<string, unknown> = {}) => ({
    code: 'gems',
    created_at: '2026-11-01T10:00:00.000Z',
    description: 'old',
    mappings: [oneTime(P1, 30), oneTime(P2, 10), subscription(P3, null)],
    name: 'Gems',
    products_count: 3,
    updated_at: 7,
    virtual_currency_id: CURRENCY,
    ...overrides,
});

const READ: Answer = { body: currency() };
const UPSERTED: Answer = { body: { ...currency(), changes: { created: [], unchanged: [], updated: [P1] } } };
const WRITTEN: Answer = { body: currency({ updated_at: 8 }) };

const conflict: Answer = {
    body: { error_code: 'virtual_currency_conflict', errors: { non_field_errors: ['The currency changed.'] }, status_code: 409 },
    status: 409,
};

/** The token that a write sent: in the query of a delete, in the body of the others. */
const tokenOf = (request: Sent | undefined): unknown => (request?.method === 'DELETE'
    ? Number(request.query.get('expected_updated_at'))
    : (JSON.parse(String(request?.body)) as Record<string, unknown>).expected_updated_at);

describe('virtual-currencies writes', () => {
    let fetchStub: sinon.SinonStub | undefined;
    let restoreStreams: () => void;
    let files: Awaited<ReturnType<typeof tempFolder>>;

    /** The path of a mapping file with these items. */
    const mappingFile = (items: unknown): Promise<string> =>
        files.write('mappings.json', typeof items === 'string' ? items : JSON.stringify(items));

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

    // external: the exit code 6 and the token that a script with no terminal gets; no write without a yes
    describe('the confirmation with no terminal', () => {
        type Row = {
            answers: Answer[];
            args: () => Promise<string[]>;
            exit?: number;
            id: string;
            /** The number of requests, reads included, when it matters. */
            requests?: number;
            text?: string;
            token?: number;
        };

        const rows: Row[] = [
            {
                answers: [WRITTEN],
                args: () => Promise.resolve(['create', '--code', 'gems', '--name', 'Gems']),
                exit: exitCode.confirmRequired,
                id: 'create without --yes: exit 6, nothing sent',
                requests: 0,
                text: 'Re-run with --yes to do it.',
            },
            {
                answers: [READ, UPSERTED],
                args: async () => ['mappings', 'upsert', CURRENCY, '--file', await mappingFile([oneTime(P1, 50)])],
                exit: exitCode.confirmRequired,
                id: 'mappings upsert without --yes: exit 6 that names the token of the read',
                text: 're-run with --yes --expected-updated-at 7',
            },
            {
                answers: [READ, WRITTEN],
                args: () => Promise.resolve(['mappings', 'delete', CURRENCY, '--product', P2]),
                exit: exitCode.confirmRequired,
                id: 'mappings delete without --yes: exit 6 that names the token of the read',
                text: 're-run with --yes --expected-updated-at 7',
            },
            {
                answers: [READ, WRITTEN],
                args: () => Promise.resolve(['update', CURRENCY, '--name', 'Gold']),
                id: 'update without --yes: sent, no question',
                token: 7,
            },
            {
                answers: [READ, UPSERTED],
                args: async () => ['mappings', 'upsert', CURRENCY, '--yes', '--file', await mappingFile([oneTime(P1, 50)])],
                exit: exitCode.confirmRequired,
                id: 'mappings upsert --yes without --expected-updated-at: exit 6, no request',
                requests: 0,
                text: '--expected-updated-at is required with --yes',
            },
            {
                answers: [WRITTEN],
                args: () => Promise.resolve(['mappings', 'delete', CURRENCY, '--product', P2, '--yes', '--expected-updated-at', '1']),
                id: 'mappings delete --yes --expected-updated-at 1: the delete with 1',
                token: 1,
            },
            {
                answers: [READ, UPSERTED],
                args: async () => ['mappings', 'upsert', CURRENCY, '--yes', '--expected-updated-at', '5', '--file',
                    await mappingFile([oneTime(P1, 50)])],
                id: 'mappings upsert --yes --expected-updated-at 5 on a read of 7: the upsert with 5',
                token: 5,
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const args = await row.args();

                fetchStub = serve(row.answers);

                const { error } = await runCli(['virtual-currencies', ...args, '--app', APP]);
                const sentWrites = writes(fetchStub);

                expect(error?.oclif?.exit, 'exit').to.equal(row.exit);

                if (row.text !== undefined) {
                    expect(error?.message, 'message').to.contain(row.text);
                }

                if (row.token === undefined) {
                    expect(sentWrites, 'writes').to.deep.equal([]);
                } else {
                    expect(sentWrites.length, 'writes').to.equal(1);
                    expect(tokenOf(sentWrites[0]), 'expected_updated_at').to.equal(row.token);
                }

                if (row.requests !== undefined) {
                    expect(fetchStub.callCount, 'requests').to.equal(row.requests);
                }
            });
        }
    });

    // external: the body of an update; a field left out is sent as read, and no flag is exit 2 with no request
    describe('the update body', () => {
        const rows: { args: string[]; body?: Record<string, unknown>; id: string }[] = [
            { args: ['--name', 'N'], body: { description: 'old', expected_updated_at: 7, name: 'N' }, id: '--name keeps the description' },
            { args: ['--clear-description'], body: { description: null, expected_updated_at: 7, name: 'Gems' }, id: '--clear-description sends null' },
            { args: ['--description', 'new'], body: { description: 'new', expected_updated_at: 7, name: 'Gems' }, id: '--description sends it' },
            { args: [], id: 'no flag: exit 2, no request' },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                fetchStub = serve([READ, WRITTEN]);

                const { error } = await runCli(['virtual-currencies', 'update', CURRENCY, '--app', APP, ...row.args]);

                if (row.body === undefined) {
                    expect(error?.oclif?.exit, 'exit').to.equal(exitCode.usage);
                    expect(fetchStub.callCount, 'requests').to.equal(0);

                    return;
                }

                expect(error, 'error').to.equal(undefined);
                expect(sent(fetchStub).map(({ method, path }) => `${method} ${path}`)).to.deep.equal([`GET ${PATH}`, `PUT ${PATH}`]);
                expect(JSON.parse(String(writes(fetchStub)[0]?.body)), 'body').to.deep.equal(row.body);
            });
        }
    });

    // external: the mapping file is sent as given, and a file of the wrong form is exit 2 before any request
    describe('the mapping file of an upsert', () => {
        const rows: { content: unknown; id: string; sent: boolean }[] = [
            { content: [oneTime(P1, 50)], id: 'a valid one-time item: sent as given', sent: true },
            { content: 'not json', id: 'not JSON: exit 2, no request', sent: false },
            { content: [], id: 'an empty list: exit 2, no request', sent: false },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const file = await mappingFile(row.content);

                fetchStub = serve([UPSERTED]);

                const { error } = await runCli(['virtual-currencies', 'mappings', 'upsert', CURRENCY, '--app', APP,
                    '--yes', '--expected-updated-at', '1', '--file', file]);

                if (!row.sent) {
                    expect(error?.oclif?.exit, 'exit').to.equal(exitCode.usage);
                    expect(fetchStub.callCount, 'requests').to.equal(0);

                    return;
                }

                expect(error, 'error').to.equal(undefined);
                expect(sent(fetchStub).map(({ method, path }) => `${method} ${path}`)).to.deep.equal([`POST ${PATH}mappings/`]);
                expect(JSON.parse(String(writes(fetchStub)[0]?.body)), 'body').to.deep.equal({ expected_updated_at: 1, upsert: row.content });
            });
        }
    });

    // external: the question that a person or an agent reads before it says yes: each change it covers
    describe('the question text', () => {
        const rows: { args: () => Promise<string[]>; id: string; texts: string[] }[] = [
            {
                args: async () => ['mappings', 'upsert', CURRENCY, '--file', await mappingFile([oneTime(P1, 50), oneTime(P4, 10)])],
                id: 'upsert of P1 30 → 50 and a new P4 = 10',
                texts: [`${P1}: 30 → 50 coins for each purchase`, `${P4}: new, 10 coins for each purchase`],
            },
            {
                args: () => Promise.resolve(['mappings', 'delete', CURRENCY, '--product', P2]),
                id: 'delete of P2',
                texts: [`mapping of the product ${P2}`, 'stop giving coins'],
            },
            {
                args: async () => ['create', '--code', 'gems', '--name', 'Gems', '--file', await mappingFile([oneTime(P1, 30)])],
                id: 'create of gems with P1',
                texts: ['virtual currency gems', `${P1}: new, 30 coins for each purchase`, 'cannot be deleted'],
            },
            {
                args: async () => ['mappings', 'upsert', CURRENCY, '--file', await mappingFile([subscription(P3, 5)])],
                id: 'upsert of the subscription P3 with only the trial credit changed',
                texts: [`${P3}: 20 coins for each period, credit_on_trial_start none → 5`],
            },
            {
                args: async () => ['mappings', 'upsert', CURRENCY, '--file', await mappingFile([oneTime(P1.toUpperCase(), 50)])],
                id: 'upsert of P1 written in uppercase: the server takes it as P1, so 30 → 50',
                texts: [`${P1.toUpperCase()}: 30 → 50 coins for each purchase`],
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const args = await row.args();

                fetchStub = serve([READ]);

                const { error } = await runCli(['virtual-currencies', ...args, '--app', APP]);

                expect(error?.oclif?.exit, 'exit').to.equal(exitCode.confirmRequired);

                for (const text of row.texts) {
                    expect(error?.message, text).to.contain(text);
                }

                expect(error?.message, 'the line for an agent').to.contain('Show this text to the user and wait for a clear yes');
            });
        }
    });

    // external: at a terminal a yes sends the token flag when it is given, else the updated_at of the read
    describe('the token after a yes at a terminal', () => {
        const rows: { args: () => Promise<string[]>; id: string; token: number }[] = [
            {
                args: async () => ['mappings', 'upsert', CURRENCY, '--file', await mappingFile([oneTime(P1, 50)])],
                id: 'mappings upsert with no token flag: the read token',
                token: 7,
            },
            {
                args: () => Promise.resolve(['mappings', 'delete', CURRENCY, '--product', P2]),
                id: 'mappings delete with no token flag: the read token',
                token: 7,
            },
            {
                args: async () => ['mappings', 'upsert', CURRENCY, '--expected-updated-at', '5', '--file', await mappingFile([oneTime(P1, 50)])],
                id: 'mappings upsert with --expected-updated-at 5: the flag, not the later read',
                token: 5,
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const args = await row.args();

                restoreStreams();
                restoreStreams = useStreams({ terminal: true, typed: 'y' });
                fetchStub = serve([READ, UPSERTED]);

                const { error } = await runCli(['virtual-currencies', ...args, '--app', APP]);
                const sentWrites = writes(fetchStub);

                expect(error, 'error').to.equal(undefined);
                expect(sentWrites.length, 'writes').to.equal(1);
                expect(tokenOf(sentWrites[0]), 'expected_updated_at').to.equal(row.token);
            });
        }
    });

    // external: a failed write says to read before a repeat (a 409, and a lost answer that is never sent again)
    describe('the next step after a failed write', () => {
        const rows: { answers: Answer[]; args: () => Promise<string[]>; exit: number; id: string; text: string }[] = [
            {
                answers: [conflict],
                args: async () => ['mappings', 'upsert', CURRENCY, '--yes', '--expected-updated-at', '5', '--file',
                    await mappingFile([oneTime(P1, 50)])],
                exit: exitCode.api,
                id: 'a stale token: exit 4 and the read to make',
                text: `Read it again with \`adapty virtual-currencies get ${CURRENCY} --app ${APP}\``,
            },
            {
                answers: [READ, 'network'],
                args: () => Promise.resolve(['update', CURRENCY, '--name', 'Gold']),
                exit: exitCode.network,
                id: 'a lost answer of an update: exit 5, sent once, read before a repeat',
                text: 'Do not repeat the write before you read the state',
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const args = await row.args();

                fetchStub = serve(row.answers);

                const { error } = await runCli(['virtual-currencies', ...args, '--app', APP]);

                expect(error?.oclif?.exit, 'exit').to.equal(row.exit);
                expect(error?.message, 'message').to.contain(row.text);
                expect(writes(fetchStub).length, 'writes').to.equal(1);
            });
        }
    });
});
