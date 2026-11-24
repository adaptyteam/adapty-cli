import { renderFooter } from '../list.js';
import { renderRecord } from '../record.js';

import type {
    UpsertedMappings,
    VirtualCurrencyDetail,
    VirtualCurrencyList,
    VirtualCurrencyMapping,
} from '../../../sdk/adapty/index.js';

/**
 * The currencies of an app as text. The tables have the fields a person picks by; `--json` has every field of
 * the server, `updated_at` (the token of a write) included.
 */

/** Every column left-aligned: the cells are words and ids. */
export const leftTable = (rows: readonly string[][]): string => {
    const widths = rows[0]?.map((_, column) => Math.max(...rows.map(row => row[column]?.length ?? 0))) ?? [];

    return rows.map(row => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ').trimEnd()).join('\n');
};

export const renderCurrencyList = (page: VirtualCurrencyList): string => {
    const footer = `${renderFooter(page.meta.pagination)}; the app can have ${page.meta.remaining_count} more`;

    if (page.data.length === 0) {
        return `No virtual currencies.\n${footer}`;
    }

    const rows = page.data.map(currency =>
        [currency.code, currency.name, String(currency.products_count), currency.virtual_currency_id]);

    return `${leftTable([['Code', 'Name', 'Products', 'Currency ID'], ...rows])}\n\n${footer}`;
};

/** `30 coins for each purchase`: what one mapping gives, in the words of its type. */
export const creditOf = (mapping: VirtualCurrencyMapping): string => (mapping.product_type === 'one-time'
    ? `${mapping.credit_per_purchase} coins for each purchase`
    : `${mapping.credit_per_cycle} coins for each period`);

const trialOf = (mapping: VirtualCurrencyMapping): string => (mapping.product_type === 'subscription'
    ? String(mapping.credit_on_trial_start ?? 'none')
    : '');

const expiringOf = (mapping: VirtualCurrencyMapping): string => {
    if (mapping.product_type !== 'subscription') {
        return '';
    }

    return mapping.expiring ? 'yes' : 'no';
};

const mappingTable = (mappings: readonly VirtualCurrencyMapping[]): string => (mappings.length === 0
    ? 'No product mappings: no purchase gives this currency.'
    : leftTable([
            ['Product ID', 'Type', 'Credit', 'Expiring', 'Trial start'],
            ...mappings.map(mapping =>
                [mapping.product_id, mapping.product_type, creditOf(mapping), expiringOf(mapping), trialOf(mapping)]),
        ]));

export const renderCurrency = (currency: VirtualCurrencyDetail): string => {
    const { mappings, ...fields } = currency;

    return `${renderRecord(fields)}\n\n${mappingTable(mappings)}`;
};

/** What a write answers: one line that says what was done, then the currency. */
export const renderWrittenCurrency = (line: string) => (currency: VirtualCurrencyDetail): string =>
    `${line}\n${renderCurrency(currency)}`;

const idsOf = (ids: readonly string[]): string => (ids.length === 0 ? 'none' : ids.join(', '));

export const renderUpserted = (answer: UpsertedMappings): string => {
    const { changes, ...currency } = answer;

    return [
        'Mappings saved.',
        `Created: ${idsOf(changes.created)}`,
        `Updated: ${idsOf(changes.updated)}`,
        `Unchanged: ${idsOf(changes.unchanged)}`,
        renderCurrency(currency),
    ].join('\n');
};
