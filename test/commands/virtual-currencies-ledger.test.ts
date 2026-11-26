import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { restoreFetch } from '../helpers/mock-fetch.js';
import { APP, runCli, sent, serve, useStreams } from '../helpers/retention-messaging.js';

import type { Answer } from '../helpers/retention-messaging.js';
import type * as sinon from 'sinon';

/**
 * The reads of the `virtual-currencies` topic (the currencies, the coin ledger and the balances), and the manual
 * adjustment of the coins of one profile.
 */

const CURRENCY = '880e8400-e29b-41d4-a716-446655440003';
const PROFILE = 'aa0e8400-e29b-41d4-a716-446655440021';

const ledgerPage = (more: boolean) => ({
    data: [{
        created_at: '2026-11-03T10:00:00.000Z',
        customer_placement_id: null,
        feature: null,
        is_sandbox: false,
        items: [{ amount: 30, balance_after: 30, currency_code: 'gems', expires_at: null }],
        metadata: null,
        operation: 'top_up',
        profile_id: PROFILE,
        reference_id: null,
        store: 'app_store',
        store_transaction_id: '2000000001',
        transaction_id: 'bb0e8400-e29b-41d4-a716-446655440031',
        transaction_type: 'store_purchase',
    }],
    meta: { pagination: { has_more: more, next_cursor: more ? 'C2' : null }, query: { timezone: 'Europe/Berlin' } },
});

const BALANCES = {
    data: [{
        available: 30,
        balance: 30,
        code: 'gems',
        expiry: { expired: 0, expiring: [], expiring_later: 0, non_expiring: 30 },
        held: 0,
        name: 'Gems',
    }],
    meta: { profile_id: PROFILE },
    response_created_at: '2026-11-24T10:00:00.000Z',
};

describe('virtual-currencies reads', () => {
    let fetchStub: sinon.SinonStub | undefined;
    let restoreStreams: () => void;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
        restoreStreams = useStreams({ terminal: false });
    });

    afterEach(() => {
        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        restoreStreams();
        delete process.env.ADAPTY_TOKEN;
    });

    // external: the route and the query that each read sends; the filters and the time zone as given
    describe('each read sends its request', () => {
        type Row = { args: string[]; body: unknown; path: string; query?: Record<string, string> };

        const rows: Row[] = [
            {
                args: ['list', '--page', '2'],
                body: { data: [], meta: { pagination: { count: 0, page: 2, pages: 1 }, remaining_count: 20 } },
                path: `/apps/${APP}/virtual-currencies/`,
                query: { 'page[number]': '2', 'page[size]': '20' },
            },
            {
                args: ['get', CURRENCY],
                body: { code: 'gems', mappings: [], name: 'Gems', products_count: 0, updated_at: 7, virtual_currency_id: CURRENCY },
                path: `/apps/${APP}/virtual-currencies/${CURRENCY}/`,
            },
            {
                args: ['transactions', 'list', '--date-from', '2026-11-01', '--date-to', '2026-11-07', '--timezone', 'Europe/Berlin',
                    '--currency-code', 'gems', '--operation', 'top_up', '--feature', 'chat', '--no-sandbox', '--page-size', '2',
                    '--cursor', 'C1'],
                body: ledgerPage(false),
                path: `/apps/${APP}/virtual-currencies/transactions/`,
                query: {
                    'filter[currency_code]': 'gems',
                    'filter[date_from]': '2026-11-01',
                    'filter[date_to]': '2026-11-07',
                    'filter[feature]': 'chat',
                    'filter[is_sandbox]': 'false',
                    'filter[operation]': 'top_up',
                    'page[cursor]': 'C1',
                    'page[size]': '2',
                    'timezone': 'Europe/Berlin',
                },
            },
            {
                args: ['profiles', 'transactions', 'list', '--profile', PROFILE, '--date-from', '2026-11-01'],
                body: ledgerPage(false),
                path: `/apps/${APP}/profiles/${PROFILE}/virtual-currencies/transactions/`,
                query: { 'filter[date_from]': '2026-11-01' },
            },
            {
                args: ['profiles', 'transactions', 'list', '--customer-user-id', 'user 42'],
                body: ledgerPage(false),
                path: `/apps/${APP}/profiles/virtual-currencies/transactions/`,
                query: { customer_user_id: 'user 42' },
            },
            {
                args: ['profiles', 'balances', 'get', '--profile', PROFILE],
                body: BALANCES,
                path: `/apps/${APP}/profiles/${PROFILE}/virtual-currencies/balances/`,
            },
        ];

        for (const row of rows) {
            it(row.args.slice(0, 3).join(' '), async () => {
                fetchStub = serve([{ body: row.body }]);

                const { error, stdout } = await runCli(['virtual-currencies', ...row.args, '--app', APP, '--json']);
                const requests = sent(fetchStub);

                expect(error, 'error').to.equal(undefined);
                expect(requests.map(({ method, path }) => `${method} ${path}`)).to.deep.equal([`GET ${row.path}`]);
                expect(Object.fromEntries(requests[0]?.query ?? []), 'query').to.deep.equal(row.query ?? {});
                expect(JSON.parse(stdout), '--json is the answer as it is').to.deep.equal(row.body);
            });
        }
    });

    // external: a profile by exactly one of the two; both or neither is exit 2 before any request
    describe('the profile address of profiles balances get', () => {
        const rows: { args: string[]; id: string; query?: Record<string, string> }[] = [
            { args: ['--profile', PROFILE, '--customer-user-id', 'U'], id: 'both: exit 2, no request' },
            { args: [], id: 'neither: exit 2, no request' },
            { args: ['--customer-user-id', 'U'], id: '--customer-user-id U: the route by customer user id', query: { customer_user_id: 'U' } },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                fetchStub = serve([{ body: BALANCES }]);

                const { error } = await runCli(['virtual-currencies', 'profiles', 'balances', 'get', '--app', APP, ...row.args]);

                if (row.query === undefined) {
                    expect(error?.oclif?.exit, 'exit').to.equal(exitCode.usage);
                    expect(fetchStub.callCount, 'requests').to.equal(0);

                    return;
                }

                const requests = sent(fetchStub);

                expect(error, 'error').to.equal(undefined);
                expect(requests.map(({ path }) => path)).to.deep.equal([`/apps/${APP}/profiles/virtual-currencies/balances/`]);
                expect(Object.fromEntries(requests[0]?.query ?? []), 'query').to.deep.equal(row.query);
            });
        }
    });

    // external: a page with more rows ends with the command of the next page: the same flags and its cursor
    describe('the next page line of transactions list', () => {
        const flags = ['--app', APP, '--date-from', '2026-11-01', '--date-to', '2026-11-07', '--timezone', 'Europe/Berlin',
            '--currency-code', 'gems'];

        const rows: { args: string[]; id: string; line?: string; more: boolean }[] = [
            {
                args: flags,
                id: 'has_more: More rows and the next command',
                line: `More rows:\nadapty virtual-currencies transactions list ${flags.join(' ')} --cursor C2`,
                more: true,
            },
            {
                args: [...flags, '--cursor', 'C1'],
                id: 'a page of a cursor: the next command has only the new cursor',
                line: `More rows:\nadapty virtual-currencies transactions list ${flags.join(' ')} --cursor C2`,
                more: true,
            },
            { args: flags, id: 'no has_more: no next page line', more: false },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                fetchStub = serve([{ body: ledgerPage(row.more) }]);

                const { error, stdout } = await runCli(['virtual-currencies', 'transactions', 'list', ...row.args]);

                expect(error, 'error').to.equal(undefined);
                expect(stdout, 'the row').to.contain('+30 gems (balance 30)');

                if (row.line === undefined) {
                    expect(stdout, 'next page').not.to.contain('More rows:');
                } else {
                    expect(stdout.trimEnd().endsWith(row.line), `ends with:\n${row.line}\ngot:\n${stdout}`).to.equal(true);
                }
            });
        }
    });
});

const UUID_V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;
const KEY = 'cc0e8400-e29b-41d4-a716-446655440041';

const ADJUSTED = {
    balance: { available: 50, balance: 50, code: 'GEMS', name: 'Gems' },
    response_created_at: 1_795_687_200_000,
    spendable: 50,
    transaction_id: 'dd0e8400-e29b-41d4-a716-446655440051',
};

const CREDIT = ['--currency-code', 'GEMS', '--direction', 'credit', '--amount', '10', '--operation', 'adjustment',
    '--feature', 'support'];

const refusal = (status: number, code: string, detail: string): Answer =>
    ({ body: { errors: [{ code, detail, status }] }, status });

/** The fields of a failure that a script reads: the error, or its object under --json. */
type JsonError = { code?: string; idempotency_key?: string; message: string };

/** The idempotency key header of each request the command sent. */
const keysSent = (stub: sinon.SinonStub): (null | string)[] =>
    stub.getCalls().map(call => new Headers((call.args as [string, RequestInit])[1].headers).get('idempotency-key'));

describe('virtual-currencies profiles transactions create', () => {
    let fetchStub: sinon.SinonStub | undefined;
    let restoreStreams: () => void;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
        restoreStreams = useStreams({ terminal: false });
    });

    afterEach(() => {
        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        restoreStreams();
        delete process.env.ADAPTY_TOKEN;
    });

    // external: what a script gets: the exit code, the request and its key, and the key in the answer and each failure
    describe('the address, the question, the key and the failures', () => {
        type Row = {
            /** cancel: Ctrl+C while the request is out. */
            answer?: 'cancel' | Answer;
            args: string[];
            /** The error code; none: not checked. */
            code?: string;
            /** The exit code; none: the write passed. */
            exit?: number;
            id: string;
            /** With --json: the error is the object on stdout, and it names the key. */
            json?: true;
            /** The key header that was sent; a pattern: a new key; none: no request. */
            key?: RegExp | string;
            /** The texts of the error message, `{key}` for the key that was sent. */
            texts?: string[];
        };

        const rows: Row[] = [
            { args: ['--profile', PROFILE, '--customer-user-id', 'U', ...CREDIT, '--yes'], exit: exitCode.usage, id: 'both: exit 2, no request' },
            { args: [...CREDIT, '--yes'], exit: exitCode.usage, id: 'neither: exit 2, no request' },
            {
                args: ['--profile', PROFILE, ...CREDIT],
                code: 'confirm_required',
                exit: exitCode.confirmRequired,
                id: 'no terminal and no --yes: exit 6 confirm_required, no request',
                texts: ['Adjust the coins of the profile', 'Re-run with --yes to do it.'],
            },
            {
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', ''],
                exit: exitCode.usage,
                id: 'an empty key: exit 2, no request',
                texts: ['Invalid idempotency key'],
            },
            {
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', 'ключ'],
                exit: exitCode.usage,
                id: 'a key that a header cannot carry: exit 2, no request',
                texts: ['Invalid idempotency key'],
            },
            { args: ['--customer-user-id', 'user 42', ...CREDIT, '--yes'], id: '--yes with no key: a new UUID v4', key: UUID_V4 },
            { args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', KEY], id: '--yes --idempotency-key K: K', key: KEY },
            {
                answer: 'network',
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', KEY],
                exit: exitCode.network,
                id: 'K and a network failure: exit 5, repeat with K within one hour',
                key: KEY,
                texts: ['The result is unknown', 'Repeat the same command with --idempotency-key {key} within one hour'],
            },
            {
                answer: 'network',
                args: ['--profile', PROFILE, ...CREDIT, '--yes'],
                exit: exitCode.network,
                id: 'no key and a network failure: the new key in the error',
                key: UUID_V4,
                texts: ['Repeat the same command with --idempotency-key {key} within one hour'],
            },
            {
                answer: 'network',
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', KEY],
                exit: exitCode.network,
                id: 'K and a network failure, --json: the error object names K and the repeat',
                json: true,
                key: KEY,
                texts: ['Repeat the same command with --idempotency-key {key} within one hour'],
            },
            {
                answer: 'cancel',
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', KEY],
                exit: exitCode.cancelled,
                id: 'K and Ctrl+C during the send: exit 130, the result is unknown, repeat with K',
                key: KEY,
                texts: ['The result is unknown', 'Repeat the same command with --idempotency-key {key} within one hour'],
            },
            {
                answer: { body: { errors: [{ detail: 'Bad gateway', status: 502 }] }, status: 502 },
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', KEY],
                exit: exitCode.api,
                id: 'K and a 502: exit 4, repeat with K within one hour',
                key: KEY,
                texts: ['The result is unknown', 'Repeat the same command with --idempotency-key {key} within one hour'],
            },
            {
                answer: refusal(409, 'idempotency_in_flight', 'A write with this key is in progress.'),
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', KEY],
                exit: exitCode.api,
                id: 'K in flight: exit 4, wait and repeat with K',
                key: KEY,
                texts: ['Wait a few seconds, then repeat the same command with --idempotency-key {key}'],
            },
            {
                answer: refusal(400, 'insufficient_balance', 'Insufficient balance for GEMS: 40 available.'),
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', KEY],
                exit: exitCode.api,
                id: 'a refusal of the server: exit 4 with its text and the key',
                key: KEY,
                texts: ['Insufficient balance for GEMS: 40 available.', 'Idempotency key: {key}.'],
            },
            {
                answer: refusal(400, 'insufficient_balance', 'Insufficient balance for GEMS: 40 available.'),
                args: ['--profile', PROFILE, ...CREDIT, '--yes', '--idempotency-key', KEY],
                code: 'insufficient_balance',
                exit: exitCode.api,
                id: 'a refusal of the server, --json: the error object names the key',
                json: true,
                key: KEY,
                texts: ['Insufficient balance for GEMS: 40 available.'],
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                fetchStub = serve([row.answer === 'cancel' ? {} : row.answer ?? { body: ADJUSTED, status: 201 }]);

                if (row.answer === 'cancel') {
                    fetchStub.callsFake(() => {
                        process.emit('SIGINT', 'SIGINT');

                        return Promise.reject(new Error('aborted'));
                    });
                }

                process.exitCode = undefined;

                const { error, stderr, stdout } = await runCli(['virtual-currencies', 'profiles', 'transactions', 'create',
                    '--app', APP, ...row.args, ...(row.json ? ['--json'] : [])]);

                // Under --json oclif prints the error object and sets the exit code in place of a throw
                const exit = row.json ? process.exitCode : error?.oclif?.exit;

                const failure = row.json
                    ? (JSON.parse(stdout) as { error: JsonError }).error
                    : error as JsonError | undefined;

                process.exitCode = undefined;

                const [key, ...more] = keysSent(fetchStub);

                expect(exit, `exit: ${failure?.message ?? ''}`).to.equal(row.exit);
                expect(more, 'one request at most').to.deep.equal([]);

                if (row.code !== undefined) {
                    expect(failure?.code, 'code').to.equal(row.code);
                }

                for (const text of row.texts ?? []) {
                    expect(failure?.message, text).to.contain(text.replace('{key}', String(key)));
                }

                if (row.key === undefined) {
                    expect(fetchStub.callCount, 'requests').to.equal(0);
                    expect(stderr, 'no key is announced').not.to.contain('Sending with');

                    return;
                }

                expect(key ?? '', 'the key header').to.match(typeof row.key === 'string' ? new RegExp(`^${row.key}$`) : row.key);
                expect(stderr, 'the key on stderr').to.contain(`Sending with the idempotency key ${String(key)}.`);

                if (row.json) {
                    expect(failure?.idempotency_key, 'idempotency_key in --json').to.equal(key);
                }

                if (row.exit === undefined) {
                    expect(stdout, 'the answer names the key').to.contain(`Idempotency key: ${String(key)}`);
                }
            });
        }
    });

    // external: the route by each profile form, the body as given, and --json: the answer of the server and the key
    describe('the request of a confirmed write', () => {
        type Row = {
            args: string[];
            body: Record<string, unknown>;
            id: string;
            path: string;
            query: Record<string, string>;
        };

        const rows: Row[] = [
            {
                args: ['--customer-user-id', 'user 42', ...CREDIT],
                body: { amount: 10, currency_code: 'GEMS', direction: 'credit', feature: 'support', operation: 'adjustment' },
                id: 'by customer user id, no comment and no reference: neither key in the body',
                path: `/apps/${APP}/profiles/virtual-currencies/transactions/`,
                query: { customer_user_id: 'user 42' },
            },
            {
                args: ['--profile', PROFILE, ...CREDIT, '--reference-id', 'ticket-7', '--comment', 'bug 12'],
                body: {
                    amount: 10,
                    comment: 'bug 12',
                    currency_code: 'GEMS',
                    direction: 'credit',
                    feature: 'support',
                    operation: 'adjustment',
                    reference_id: 'ticket-7',
                },
                id: 'by profile id with a comment and a reference',
                path: `/apps/${APP}/profiles/${PROFILE}/virtual-currencies/transactions/`,
                query: {},
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                fetchStub = serve([{ body: ADJUSTED, status: 201 }]);

                const { error, stdout } = await runCli(['virtual-currencies', 'profiles', 'transactions', 'create', '--app', APP,
                    ...row.args, '--yes', '--idempotency-key', KEY, '--json']);

                const requests = sent(fetchStub);

                expect(error, 'error').to.equal(undefined);
                expect(requests.map(({ method, path }) => `${method} ${path}`)).to.deep.equal([`POST ${row.path}`]);
                expect(Object.fromEntries(requests[0]?.query ?? []), 'query').to.deep.equal(row.query);
                expect(JSON.parse(String(requests[0]?.body)), 'body').to.deep.equal(row.body);
                expect(JSON.parse(stdout), '--json').to.deep.equal({ ...ADJUSTED, idempotency_key: KEY });
            });
        }
    });

    // external: the question that a person reads at a terminal, and no write after a no
    it('the question at a terminal names the change; no sends nothing', async () => {
        restoreStreams();
        restoreStreams = useStreams({ terminal: true, typed: 'n' });
        fetchStub = serve([{ body: ADJUSTED, status: 201 }]);

        const { error, stderr } = await runCli(['virtual-currencies', 'profiles', 'transactions', 'create', '--app', APP,
            '--profile', PROFILE, ...CREDIT]);

        expect(error?.oclif?.exit, 'exit').to.equal(1);

        expect(stderr, 'the question').to.contain(`Adjust the coins of the profile ${PROFILE}: credit 10 GEMS (operation `
            + 'adjustment, feature support)');

        expect(fetchStub.callCount, 'requests').to.equal(0);
    });
});
