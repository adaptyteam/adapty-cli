import { isFailed, productStores, storePrices } from '../../sdk/adapty/index.js';

import { csvLine } from './csv.js';
import { table } from './table.js';

import type {
    PriceDifferenceRow,
    PricePreview,
    PriceRow,
    PriceRowError,
    ProductStore,
    StorePrice,
} from '../../sdk/adapty/index.js';

const NO_VALUE = '—';

const show = (value: null | number | string | undefined): string =>
    (value === null || value === undefined ? NO_VALUE : String(value));

/** The country as the dashboard names it; the code when the server sends no name. */
const nameOf = (price: StorePrice): string => (price.region_name === '' ? price.region_code : price.region_name);

const nameWithCode = (price: StorePrice): string => {
    const name = nameOf(price);

    return name === price.region_code ? name : `${name} (${price.region_code})`;
};

/** One line per country and store: the price asked for, the price at the store, the status; the failures under them. */
export const renderStorePrices = (prices: readonly StorePrice[]): string => {
    if (prices.length === 0) {
        return 'No prices.';
    }

    const rows = prices.map(price => [
        nameOf(price),
        price.region_code,
        price.store,
        show(price.currency),
        show(price.requested_price),
        show(price.synced_price),
        show(price.status),
    ]);

    const failures = prices.filter(price => isFailed(price))
        .map(price => `${nameWithCode(price)} ${price.store}: ${show(price.error)}`);

    return [table([['Country', 'Code', 'Store', 'Currency', 'Requested', 'Synced', 'Status'], ...rows]), ...failures].join('\n');
};

export const renderPriceRows = (rows: readonly PriceRow[]): string =>
    renderStorePrices(rows.flatMap(row => storePrices(row)));

/** The portal stores a price with 2 decimals and writes it as stored: 3990.00. */
const price2 = (value: null | number): null | string => (value === null ? null : value.toFixed(2));

/** An empty text is an empty field, as in the dashboard file. */
const blank = (value: null | string): null | string => (value === '' ? null : value);

const csvCells = (row: PriceRow): (null | string)[] => [
    row.region_name,
    row.region_code,
    ...productStores.flatMap(store => [
        row[`${store}_currency`],
        price2(row[`${store}_requested_price`]),
        price2(row[`${store}_synced_price`]),
        row[`${store}_sync_status`],
    ]),
].map(value => blank(value));

/** The columns of the dashboard price download; every line ends with a line break, the last too, as in that file. */
export const renderPricesCsv = (rows: readonly PriceRow[]): string => [
    'region_name,region_code,app_store_currency,app_store_requested_price,app_store_synced_price,app_store_sync_status,'
    + 'play_store_currency,play_store_requested_price,play_store_synced_price,play_store_sync_status',
    ...rows.map(row => csvLine(csvCells(row))),
].map(line => `${line}\r\n`).join('');

const storeChange = (row: PriceDifferenceRow, store: ProductStore): string[] | undefined => {
    const proposed = row[`${store}_proposed_price`];
    const rounded = row[`${store}_rounded_price`];

    return (proposed ?? null) === null && (rounded ?? null) === null
        ? undefined
        : [row.region_code, store, show(row[`${store}_currency`]), show(row[`${store}_current_price`]), show(proposed), show(rounded)];
};

/** What a save would change: the currency and the current, asked and rounded price of each country and store. */
export const renderPreview = (preview: PricePreview): string => {
    const lines = preview.difference.rows.flatMap(row => [storeChange(row, 'app_store'), storeChange(row, 'play_store')])
        .filter(line => line !== undefined);

    return table([['Country', 'Store', 'Currency', 'Current', 'Proposed', 'Rounded'], ...lines]);
};

/** The preview's problems, one line each, with the row and the column when the server names them. */
export const renderRowErrors = (errors: readonly PriceRowError[]): string => errors.map((error) => {
    const place = [
        error.row === null || error.row === undefined ? undefined : `row ${error.row}`,
        error.column === null || error.column === undefined ? undefined : `column ${error.column}`,
    ].filter(part => part !== undefined).join(', ');

    return `${error.error_code}: ${error.message}${place === '' ? '' : ` (${place})`}`;
}).join('\n');
