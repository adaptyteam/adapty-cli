/** What the price operations share: the rows as the server sends them (snake_case, as --json prints them). */

import { productStores } from '../products/index.js';

import type { ProductStore } from '../products/index.js';

/** One country: the price columns of each store, as the dashboard CSV has them. */
export type PriceRow = {
    app_store_currency: null | string;
    app_store_requested_price: null | number;
    app_store_sync_error: null | string;
    app_store_sync_status: null | string;
    app_store_synced_price: null | number;
    play_store_currency: null | string;
    play_store_requested_price: null | number;
    play_store_sync_error: null | string;
    play_store_sync_status: null | string;
    play_store_synced_price: null | number;
    region_code: string;
    region_name: string;
};

/** A row of a save: what the dashboard sends, and what the preview answers in `data.rows`. */
export type PriceWriteRow = {
    app_store_currency?: null | string;
    app_store_price?: null | number;
    play_store_currency?: null | string;
    play_store_price?: null | number;
    region_code: string;
    region_name?: string;
};

export type PriceRowError = {
    column?: null | string;
    error_code: string;
    message: string;
    row?: null | number;
    value?: unknown;
};

/** A store of a country in the preview: the current, the asked and the rounded price. */
export type PriceDifferenceRow = {
    app_store_current_price?: null | number;
    app_store_currency?: null | string;
    app_store_price_change?: null | number;
    app_store_proposed_price?: null | number;
    app_store_rounded_price?: null | number;
    play_store_current_price?: null | number;
    play_store_currency?: null | string;
    play_store_price_change?: null | number;
    play_store_proposed_price?: null | number;
    play_store_rounded_price?: null | number;
    region_code: string;
    region_name: string;
};

export type PricePreview = {
    data: { rows: PriceWriteRow[] };
    difference: { rows: PriceDifferenceRow[] };
    errors: PriceRowError[];
};

export type SavedPrices = {
    saved_rows: number;
};

/** What a preview allows: row errors stop the save, no difference has nothing to save. */
export type SaveDecision = 'no_changes' | 'ready' | 'row_errors';

export const decideSave = (preview: PricePreview): SaveDecision => {
    if (preview.errors.length > 0) {
        return 'row_errors';
    }

    return preview.difference.rows.length === 0 ? 'no_changes' : 'ready';
};

/** One store of one country, flat: the line a table, a wait and a failure message work with. */
export type StorePrice = {
    currency: null | string;
    error: null | string;
    region_code: string;
    region_name: string;
    requested_price: null | number;
    status: null | string;
    store: ProductStore;
    synced_price: null | number;
};

const storePrice = (row: PriceRow, store: ProductStore): StorePrice => ({
    currency: row[`${store}_currency`],
    error: row[`${store}_sync_error`],
    region_code: row.region_code,
    region_name: row.region_name,
    requested_price: row[`${store}_requested_price`],
    status: row[`${store}_sync_status`],
    store,
    synced_price: row[`${store}_synced_price`],
});

const hasData = (price: StorePrice): boolean =>
    price.currency !== null || price.requested_price !== null || price.synced_price !== null || price.status !== null;

/** The stores of a country that have any value; a store with none is not a line. */
export const storePrices = (row: PriceRow): StorePrice[] =>
    productStores.map(store => storePrice(row, store)).filter(price => hasData(price));

const wrote = (saved: PriceWriteRow, store: ProductStore): boolean => saved[`${store}_price`] != null;

/** How many store lines a save wrote: what `storePricesOfSave` returns when the list has every country. */
export const storesWritten = (saved: readonly PriceWriteRow[]): number =>
    saved.reduce((count, write) => count + productStores.filter(store => wrote(write, store)).length, 0);

/** The stores the save wrote, in the countries it wrote: what a wait follows. */
export const storePricesOfSave = (saved: readonly PriceWriteRow[], listed: readonly PriceRow[]): StorePrice[] =>
    saved.flatMap(write => listed.filter(row => row.region_code === write.region_code)
        .flatMap(row => productStores.filter(store => wrote(write, store)).map(store => storePrice(row, store))));

export const isPending = (price: StorePrice): boolean => price.status === 'pending';

export const isSynced = (price: StorePrice): boolean => price.status === 'synced';

/** A failed sync: the store task failed, or the move of the subscribers did. */
export const isFailed = (price: StorePrice): boolean =>
    price.status === 'failed' || price.status === 'subscribers_migration_failed';
