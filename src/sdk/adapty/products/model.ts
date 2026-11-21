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

/**
 * The App Store plan that bills an annual product monthly with a 12-month commitment. `price_usd` is null when the plan
 * came with a first purchase and has no price in Adapty yet.
 */
export type MonthlyPlan = {
    price_usd: null | number;
    vendor_product_id: string;
};

export type Product = {
    access_level_id: string;
    /** Null when the product has no plan; absent when the server does not know the monthly plan. */
    app_store_monthly_plan?: MonthlyPlan | null;
    id: string;
    offers_count: number;
    period: ProductPeriod;
    price_usd: null | number;
    title: string;
    vendor_products: Record<string, VendorProduct>;
};
