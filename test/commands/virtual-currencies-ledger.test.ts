import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { restoreFetch } from '../helpers/mock-fetch.js';
import { APP, runCli, sent, serve, useStreams } from '../helpers/retention-messaging.js';

import type * as sinon from 'sinon';

/** The reads of the `virtual-currencies` topic: the currencies, the coin ledger and the balances. */

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
