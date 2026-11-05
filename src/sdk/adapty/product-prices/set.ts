import type { PriceWriteRow } from './model.js';
import type { Issue } from '../../core/errors.js';

export type PriceRowInput = {
    appStoreCurrency?: string | undefined;
    /** Where the row came from, for a validation message; not sent. */
    line?: number | undefined;
    appStorePrice?: number | undefined;
    playStoreCurrency?: string | undefined;
    playStorePrice?: number | undefined;
    regionCode: string;
    regionName?: string | undefined;
};

export type PreviewPricesInput = {
    rows: readonly PriceRowInput[];
};

/** What a save takes: the rows of the preview answer, which carry the rounded prices. */
export type SavePricesInput = {
    applyToExistingSubscribers: boolean;
    rows: readonly PriceWriteRow[];
};

const isPrice = (value: number | undefined): boolean => value === undefined || (Number.isFinite(value) && value > 0);

const isCurrency = (value: string | undefined): boolean => value === undefined || /^[A-Z]{3}$/.test(value);

export const validatePreviewPrices = (input: PreviewPricesInput): Issue[] => {
    if (input.rows.length === 0) {
        return [{ message: 'give at least one price row' }];
    }

    return input.rows.flatMap((row, index) => {
        const where = row.line === undefined ? `row ${index + 1}` : `line ${row.line}`;

        if (!/^[A-Z]{2}$/.test(row.regionCode)) {
            return [{ message: `${where}: the country code must be 2 letters, e.g. DE` }];
        }

        if (row.appStorePrice === undefined && row.playStorePrice === undefined) {
            return [{ message: `${where}: give an App Store or a Google Play price` }];
        }

        if (!isPrice(row.appStorePrice) || !isPrice(row.playStorePrice)) {
            return [{ message: `${where}: a price must be a number above 0` }];
        }

        return isCurrency(row.appStoreCurrency) && isCurrency(row.playStoreCurrency)
            ? []
            : [{ message: `${where}: a currency must be 3 upper-case letters, e.g. EUR` }];
    });
};

const toRowRequest = (row: PriceRowInput): PriceWriteRow => ({
    region_code: row.regionCode,
    ...(row.regionName === undefined ? {} : { region_name: row.regionName }),
    ...(row.appStoreCurrency === undefined ? {} : { app_store_currency: row.appStoreCurrency }),
    ...(row.appStorePrice === undefined ? {} : { app_store_price: row.appStorePrice }),
    ...(row.playStoreCurrency === undefined ? {} : { play_store_currency: row.playStoreCurrency }),
    ...(row.playStorePrice === undefined ? {} : { play_store_price: row.playStorePrice }),
});

export const toPreviewRequest = (input: PreviewPricesInput): { rows: PriceWriteRow[] } => ({
    rows: input.rows.map(row => toRowRequest(row)),
});

type SavePricesRequest = { apply_to_existing_subscribers: boolean; rows: readonly PriceWriteRow[] };

export const toSaveRequest = (input: SavePricesInput): SavePricesRequest => ({
    apply_to_existing_subscribers: input.applyToExistingSubscribers,
    rows: input.rows,
});
