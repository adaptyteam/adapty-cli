import { creditOf } from './currencies.js';

import type { MappingItem, VirtualCurrencyDetail, VirtualCurrencyMapping } from '../../../sdk/adapty/index.js';

/**
 * The questions of the currency writes. Each shows what the write changes, so that a yes covers only a change
 * that the question showed; a person reads them at a terminal, and an agent gets them in the exit 6 text.
 */

/** The sentence that each question of the topic ends with: an agent shows the text and waits for a yes. */
export const ASK_THE_USER = 'Show this text to the user and wait for a clear yes before you re-run with --yes.';

/** For a write with a token: `--yes` alone is refused, so the line names the token of the read too. */
export const askWithToken = (updatedAt: number): string => 'Show this text to the user and wait for a clear yes before '
    + `you re-run with --yes --expected-updated-at ${updatedAt} (the updated_at of the currency read).`;

const AFTER_A_LOST_ANSWER = 'After a network error or a 5xx, read the currency before you repeat a write: the first '
    + 'write can have passed, and a repeat can then give 409, 404 or the 400 of a used code.';

/** What a mapping is, in the help of the writes that set mappings. */
export const MAPPING_HELP = 'A mapping is the number of coins that a product gives: on each purchase of a one-time '
    + 'product, on each period of a subscription.';

/** A value of a mapping item as a person reads it: null is none, anything that is not a word is its JSON. */
const text = (value: unknown): string => {
    if (value === null || value === undefined) {
        return 'none';
    }

    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
};

/** The server reads a product id in any letter case and sends it in lowercase. */
const sameProduct = (stored: string, given: unknown): boolean =>
    typeof given === 'string' && stored.toLowerCase() === given.toLowerCase();

const creditField = (item: MappingItem): string =>
    (item.product_type === 'subscription' ? 'credit_per_cycle' : 'credit_per_purchase');

const unit = (item: MappingItem): string =>
    (item.product_type === 'subscription' ? 'coins for each period' : 'coins for each purchase');

/** The fields other than the credit that an item can change, as old → new. */
const OTHER_FIELDS = ['product_type', 'expiring', 'credit_on_trial_start'] as const;

const newMappingLine = (item: MappingItem): string => {
    const extra = item.product_type === 'subscription'
        ? `, expiring ${text(item.expiring)}, credit_on_trial_start ${text(item.credit_on_trial_start)}`
        : '';

    return `${text(item.product_id)}: new, ${text(item[creditField(item)])} ${unit(item)}${extra}`;
};

const changedMappingLine = (item: MappingItem, stored: VirtualCurrencyMapping): string => {
    const before = stored as unknown as MappingItem;
    const oldCredit = text(before[creditField(stored)]);
    const newCredit = text(item[creditField(item)]);
    const credit = oldCredit === newCredit ? `${newCredit} ${unit(item)}` : `${oldCredit} → ${newCredit} ${unit(item)}`;

    const others = OTHER_FIELDS
        .filter(field => (field in item || field in before) && text(item[field]) !== text(before[field]))
        .map(field => `${field} ${text(before[field])} → ${text(item[field])}`);

    const unchanged = oldCredit === newCredit && others.length === 0 ? ', no change' : '';

    return `${text(item.product_id)}: ${[credit, ...others].join(', ')}${unchanged}`;
};

/** The question of an upsert: each product as new, or old → new, from the currency read just before. */
export const upsertQuestion = (currency: VirtualCurrencyDetail, items: readonly MappingItem[]): string => {
    const lines = items.map((item) => {
        const stored = currency.mappings.find(mapping => sameProduct(mapping.product_id, item.product_id));

        return `  ${stored === undefined ? newMappingLine(item) : changedMappingLine(item, stored)}`;
    });

    return [
        `Change the product mappings of the currency ${currency.code} (${currency.name}):`,
        ...lines,
        'Each later purchase of these products gives these coins. The mappings of other products stay as they are.',
    ].join('\n');
};

/** The question of a mapping delete. */
export const deleteQuestion = (currency: VirtualCurrencyDetail, productId: string): string => {
    const stored = currency.mappings.find(mapping => sameProduct(mapping.product_id, productId));
    const now = stored === undefined ? 'the read shows no mapping of it' : `now ${creditOf(stored)}`;

    return `Remove the mapping of the product ${productId} from the currency ${currency.code} (${currency.name}); ${now}. `
        + 'After it, the purchases of this product stop giving coins of this currency, and no ledger record shows the '
        + 'coins they did not give.';
};

/** The question of a create: a currency is permanent. */
export const createQuestion = (code: string, items: readonly MappingItem[]): string => {
    const mapped = items.length === 0
        ? 'No product mappings: no purchase gives this currency until you add one.'
        : ['Product mappings:', ...items.map(item => `  ${newMappingLine(item)}`)].join('\n');

    return `Create the virtual currency ${code}. A currency cannot be deleted and its code cannot change; an app has a `
        + `limited number of currencies.\n${mapped}`;
};

/** The help sentence of each write. */
export const WRITE_HELP = AFTER_A_LOST_ANSWER;
