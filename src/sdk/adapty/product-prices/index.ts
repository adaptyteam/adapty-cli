/** The door of the product-prices resource: re-exports only, no code of its own. */
export { decideSave, isFailed, isPending, isSynced, storePrices, storesWritten } from './model.js';
export { productPrices } from './resource.js';
export { validatePreviewPrices } from './set.js';

export type {
    PriceDifferenceRow,
    PricePreview,
    PriceRow,
    PriceRowError,
    PriceWriteRow,
    SaveDecision,
    SavedPrices,
    StorePrice,
} from './model.js';
export type { ProductPricesApi } from './resource.js';
export type { PreviewPricesInput, PriceRowInput, SavePricesInput } from './set.js';
