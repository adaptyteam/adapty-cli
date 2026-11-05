/** What the product operations share: the product as the server sends it (snake_case, as --json prints it). */

export const productStores = ['app_store', 'play_store'] as const;
export type ProductStore = (typeof productStores)[number];

export const productPeriods = ['weekly', 'monthly', 'two_months', 'trimonthly', 'semiannual', 'annual', 'lifetime'] as const;
export type ProductPeriod = (typeof productPeriods)[number];

export type VendorProduct = {
    base_plan_id: null | string;
    id: null | string;
    product_id: null | string;
    /** `draft`, `in_review`, `rejected`, `approved`, `action_required`, or null when Adapty has no status for it. */
    store_status: null | string;
};

export type Product = {
    access_level_id: string;
    id: string;
    offers_count: number;
    period: ProductPeriod;
    price_usd: null | number;
    title: string;
    vendor_products: Record<string, VendorProduct>;
};
