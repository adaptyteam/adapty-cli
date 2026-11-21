import type { MonthlyPlan, Product } from './model.js';
import type { Issue } from '../../core/errors.js';

/** The App Store USD price points, as the server lists them: every point, not only those of one product. */
export type PriceList = {
    product_prices: number[];
};

/** The monthly prices one product can take, and the annual price they are checked against. */
export type MonthlyPlanPrices = {
    annual_price_usd: number;
    prices: number[];
};

export type SetMonthlyPlanInput = {
    priceUsd: number;
};

/**
 * Why a product cannot have a monthly plan, as the server words it on a plan write, in the order the server checks.
 * The price list shows the same reason, so a product that the list refuses is refused by the write too.
 */
export const monthlyPlanRefusals = [
    'monthly_plan_requires_annual_product',
    'monthly_plan_requires_product_price',
    'monthly_plan_has_no_price_points',
    'monthly_plan_requires_app_store_product',
] as const;

export type MonthlyPlanRefusal = (typeof monthlyPlanRefusals)[number];

/** Only the shape: the range and the price points are the server's rules, and its refusal names the range. */
export const validateSetMonthlyPlan = (input: SetMonthlyPlanInput): Issue[] =>
    (Number.isFinite(input.priceUsd) && input.priceUsd >= 0
        ? []
        : [{ message: 'must be a number of 0 or more', path: 'priceUsd' }]);

export const toMonthlyPlanRequest = (input: SetMonthlyPlanInput): { price_usd: number } =>
    ({ price_usd: input.priceUsd });

const toCents = (usd: number): number => Math.round(usd * 100);

/**
 * Apple's rule, in whole cents as the dashboard counts them: 12 monthly payments add up to at least the annual price
 * and at most 1.5 times it. A point exactly at a bound fits.
 */
export const fittingMonthlyPrices = (annualUsd: number, prices: readonly number[]): number[] => {
    const annual = toCents(annualUsd);
    const lowest = Math.ceil(annual / 12);
    const highest = Math.floor((annual * 3) / 24);

    return prices.filter((price) => {
        const cents = toCents(price);

        return cents >= lowest && cents <= highest;
    });
};

const hasAppStoreProduct = (product: Product): boolean => {
    const id = product.vendor_products.app_store?.product_id;

    return typeof id === 'string' && id.trim() !== '';
};

/** The prices of the plan of one product, or the first reason why it cannot have one. */
export const monthlyPlanPrices = (
    product: Product,
    list: PriceList,
): MonthlyPlanPrices | { refusal: MonthlyPlanRefusal } => {
    if (product.period !== 'annual') {
        return { refusal: 'monthly_plan_requires_annual_product' };
    }

    // Both mean no annual price: 0 after a create without one, null after an update without one
    if (product.price_usd === null || product.price_usd === 0) {
        return { refusal: 'monthly_plan_requires_product_price' };
    }

    const prices = fittingMonthlyPrices(product.price_usd, list.product_prices);

    if (prices.length === 0) {
        return { refusal: 'monthly_plan_has_no_price_points' };
    }

    if (!hasAppStoreProduct(product)) {
        return { refusal: 'monthly_plan_requires_app_store_product' };
    }

    return { annual_price_usd: product.price_usd, prices };
};

/** Whether the server knows the monthly plan: an older one leaves the key out of the product. */
type KnownPlanProduct = Product & { app_store_monthly_plan: MonthlyPlan | null };

export const knowsMonthlyPlan = (product: Product): product is KnownPlanProduct => 'app_store_monthly_plan' in product;
