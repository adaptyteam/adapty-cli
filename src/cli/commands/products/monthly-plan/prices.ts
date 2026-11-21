import { monthlyPlanPrices } from '../../../../sdk/adapty/products/index.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { PLAN_NOTES, refusalError, withNotSupported } from '../../../errors/monthly-plan.js';
import { appIdFlag } from '../../../input/app.js';
import { productIdArg } from '../../../input/product.js';
import { renderMonthlyPlanPrices } from '../../../views/products.js';

import type { MonthlyPlanPrices } from '../../../../sdk/adapty/index.js';

export default class ProductsMonthlyPlanPrices extends AdaptyCommand {
    static override summary = 'List the monthly prices that the App Store monthly plan of an annual product can take';

    static override description = [
        'Reads the product and the App Store price points, and keeps the points where 12 monthly payments add up to '
        + '1x to 1.5x the annual price, in whole cents. Give one of them to `products monthly-plan set --price-usd`.',
        'A product that cannot have a plan exits 4 with the code a plan write would get: '
        + '`monthly_plan_requires_annual_product`, `monthly_plan_requires_product_price` (no annual price), '
        + '`monthly_plan_has_no_price_points` or `monthly_plan_requires_app_store_product`.',
        PLAN_NOTES,
    ].join('\n\n');

    static override examples = ['<%= config.bin %> products monthly-plan prices 660e8400-... --app 550e8400-...'];

    static override args = { ...productIdArg };

    static override flags = { ...appIdFlag };

    async run(): Promise<MonthlyPlanPrices> {
        const { args, flags } = await this.parse(ProductsMonthlyPlanPrices);
        const { products } = this.adapty;
        const product = await products.get(flags.app, args.product_id);

        const list = await products.priceList(flags.app).catch((error: unknown) => {
            throw withNotSupported(error);
        });

        const answer = monthlyPlanPrices(product, list);

        if ('refusal' in answer) {
            throw refusalError(answer.refusal);
        }

        this.render(answer, renderMonthlyPlanPrices);

        return answer;
    }
}
