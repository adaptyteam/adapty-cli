import { leftTable } from './currencies.js';

import type { Balance, Balances, LedgerPage, LedgerRow } from '../../../sdk/adapty/index.js';

/**
 * The coin ledger as text: one page of rows, then the command of the next page; and the balances of one
 * profile. `--json` is the answer of the server as it is.
 */

/** Totals and trends are the charts' job: a page is a part of the period, and the charts leave out sandbox profiles. */
export const LEDGER_HELP = 'One page for each call: a page with more rows ends with the command of the next page, which '
    + 'needs the same filters and time zone. For totals and trends use the virtual currency charts (`adapty analytics '
    + 'catalog`): a chart leaves out each profile with a sandbox row and the list does not, so a sum of rows can differ.';

const itemsOf = (row: LedgerRow): string => row.items
    .map(item => `${item.amount > 0 ? '+' : ''}${item.amount} ${item.currency_code} (balance ${item.balance_after})`)
    .join(', ');

const ledgerRow = (row: LedgerRow): string[] => [
    row.created_at,
    row.operation ?? row.transaction_type,
    itemsOf(row),
    row.is_sandbox ? 'sandbox' : '',
    row.profile_id,
];

/** A word of a shell command line: as it is when it is safe, else in single quotes. */
const shellWord = (word: string): string =>
    (/^[\w%+,./:=@-]+$/.test(word) ? word : `'${word.replaceAll('\'', '\'\\\'\'')}'`);

/** The argv of this page without its cursor, so the next page has the same filters and only a new cursor. */
const withoutCursor = (argv: readonly string[]): string[] => {
    const kept: string[] = [];

    for (let index = 0; index < argv.length; index += 1) {
        const word = argv[index] ?? '';

        if (word === '--cursor') {
            index += 1;
        } else if (!word.startsWith('--cursor=')) {
            kept.push(word);
        }
    }

    return kept;
};

/** The command of the next page: this command with the same flags and `--cursor <next_cursor>`. */
export const nextPageCommand = (command: readonly string[], argv: readonly string[], cursor: string): string =>
    [...command, ...withoutCursor(argv), '--cursor', cursor].map(word => shellWord(word)).join(' ');

/**
 * A reader of one page takes it as the whole period unless the page says there is more, so a page with
 * `has_more` ends with the command of the next one.
 */
export const renderLedgerPage = (page: LedgerPage, next: (cursor: string) => string): string => {
    const table = page.data.length === 0
        ? 'No transactions.'
        : leftTable([['Created', 'Operation', 'Coins', 'Sandbox', 'Profile ID'], ...page.data.map(row => ledgerRow(row))]);

    const { has_more: more, next_cursor: cursor } = page.meta.pagination;

    return more && cursor !== null ? `${table}\n\nMore rows:\n${next(cursor)}` : table;
};

const expiringOf = (balance: Balance): string => {
    const amounts = balance.expiry.expiring.map(entry => `${entry.amount} at ${entry.expires_at}`);

    return [...amounts, ...(balance.expiry.expiring_later > 0 ? [`${balance.expiry.expiring_later} later`] : [])].join(', ');
};

export const renderBalances = (answer: Balances): string => {
    if (answer.data.length === 0) {
        return `No balances for the profile ${answer.meta.profile_id}.`;
    }

    const rows = answer.data.map(balance => [
        balance.code,
        String(balance.balance),
        String(balance.held),
        String(balance.available),
        String(balance.expiry.non_expiring),
        expiringOf(balance),
        String(balance.expiry.expired),
    ]);

    return `Profile ${answer.meta.profile_id}, as of ${answer.response_created_at}\n`
        + leftTable([['Code', 'Balance', 'Held', 'Available', 'Non-expiring', 'Expiring', 'Expired'], ...rows]);
};
