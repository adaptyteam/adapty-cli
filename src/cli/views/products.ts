import { renderFooter } from './list.js';
import { renderRecord } from './record.js';

import type { MonthlyPlan, MonthlyPlanPrices, Paginated, Product } from '../../sdk/adapty/index.js';

const usd = (amount: number): string => `$${amount.toFixed(2)}`;

/** What the plan field says, in words; an absent field is a server that does not know the plan, never "no plan". */
export const monthlyPlanText = (product: Product): string => {
    if (!('app_store_monthly_plan' in product)) {
        return 'not available on this server';
    }

    return planText(product.app_store_monthly_plan ?? null);
};

export const planText = (plan: MonthlyPlan | null): string => {
    if (plan === null) {
        return 'none';
    }

    return plan.price_usd === null ? 'price not set in Adapty' : `${usd(plan.price_usd)} a month`;
};

/** A product as `renderRecord` prints it, with the monthly plan as one line in place of its nested block. */
export const renderProduct = (product: Product): string => {
    const { app_store_monthly_plan: _plan, ...rest } = product;

    return `${renderRecord(rest)}\nMonthly plan: ${monthlyPlanText(product)}`;
};

/** A page as `renderPage` prints it, every product with its monthly plan line. */
export const renderProductPage = (page: Paginated<Product>): string => {
    const blocks = page.data.map(product => `${renderProduct(product)}\n`).join('---\n');

    return `${blocks}\n${renderFooter(page.meta.pagination)}`;
};

export const renderMonthlyPlanPrices = (answer: MonthlyPlanPrices): string => [
    `Annual price: ${usd(answer.annual_price_usd)}`,
    'Monthly prices that fit (12 payments add up to 1x to 1.5x the annual price):',
    ...answer.prices.map(price => price.toFixed(2)),
].join('\n');
