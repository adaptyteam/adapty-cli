import { readFileSync } from 'node:fs';

import { ValidationError } from '../../../../../sdk/core/errors.js';
import { isAmount } from '../../../../input/product.js';

import { parseCsv } from './csv.js';

import type { CsvRow } from './csv.js';
import type { PriceRowInput } from '../../../../../sdk/adapty/index.js';

/** What the flags of `--country` say, in the names the sdk uses. */
export type CountryFlags = {
    'app-store-currency'?: string | undefined;
    'app-store-price'?: number | undefined;
    'country'?: string | undefined;
    'play-store-currency'?: string | undefined;
    'play-store-price'?: number | undefined;
};

const given = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();

    return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

/**
 * Only a-z: `toUpperCase` turns `ß` into `SS` and `ı` into `I`, which would pass the 2- and 3-letter rules. Any other
 * character stays as typed for the sdk rule to refuse.
 */
const upperAscii = (value: string): string => value.replaceAll(/[a-z]/g, char => char.toUpperCase());

const currency = (value: string | undefined): string | undefined => {
    const code = given(value);

    return code === undefined ? undefined : upperAscii(code);
};

export const rowOfFlags = (flags: CountryFlags): PriceRowInput => ({
    appStoreCurrency: currency(flags['app-store-currency']),
    appStorePrice: flags['app-store-price'],
    playStoreCurrency: currency(flags['play-store-currency']),
    playStorePrice: flags['play-store-price'],
    regionCode: upperAscii((flags.country ?? '').trim()),
});

const invalidFile = (message: string): never => {
    throw new ValidationError([{ message, path: 'file' }]);
};

const readText = (path: string): string => {
    try {
        return readFileSync(path, 'utf8');
    } catch (error) {
        return invalidFile(`cannot be read: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * The rows of the CSV that `product-prices list --csv` and the dashboard download write. The requested price is the
 * price to save; the synced prices and the statuses are the store's side and are dropped, as the dashboard does. A row
 * without a requested price is skipped, as the dashboard import does.
 */
export const rowsOfCsv = (text: string): PriceRowInput[] => {
    const [header, ...rows] = parseCsv(text);
    const column = (name: string): number => header?.cells.findIndex(cell => cell.trim() === name) ?? -1;

    if (column('region_code') === -1) {
        return invalidFile('has no region_code column: use the CSV of `product-prices list --csv`');
    }

    if (column('app_store_requested_price') === -1 && column('play_store_requested_price') === -1) {
        return invalidFile('has neither an app_store_requested_price nor a play_store_requested_price column: '
            + 'use the CSV of `product-prices list --csv`');
    }

    const cell = (row: CsvRow, name: string): string | undefined => given(row.cells[column(name)]);

    const price = (row: CsvRow, name: string): number | undefined => {
        const value = cell(row, name);

        if (value === undefined) {
            return undefined;
        }

        return isAmount(value) ? Number(value) : invalidFile(`line ${row.line}, ${name}: expected a number, got "${value}"`);
    };

    return rows.flatMap((row) => {
        const appStorePrice = price(row, 'app_store_requested_price');
        const playStorePrice = price(row, 'play_store_requested_price');

        if (appStorePrice === undefined && playStorePrice === undefined) {
            return [];
        }

        return [{
            appStoreCurrency: currency(cell(row, 'app_store_currency')),
            appStorePrice,
            line: row.line,
            playStoreCurrency: currency(cell(row, 'play_store_currency')),
            playStorePrice,
            regionCode: upperAscii(cell(row, 'region_code') ?? ''),
            regionName: cell(row, 'region_name'),
        }];
    });
};

export const readPriceFile = (path: string): PriceRowInput[] => rowsOfCsv(readText(path));
