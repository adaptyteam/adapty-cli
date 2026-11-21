import { knowsMonthlyPlan, validateSetMonthlyPlan } from '../../../../sdk/adapty/products/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import {
    ASK_FOR_YES,
    isLostAnswer,
    NO_REMOVAL,
    notSupportedError,
    PLAN_NOTES,
    withNotSupported,
} from '../../../errors/monthly-plan.js';
import { withUnknownResult } from '../../../errors/retention-messaging.js';
import { appIdFlag } from '../../../input/app.js';
import { canAsk, confirmAction, yesFlag } from '../../../input/confirm.js';
import { amountFlag, productIdArg } from '../../../input/product.js';
import { monthlyPlanText, planText } from '../../../views/products.js';

import type { MonthlyPlan } from '../../../../sdk/adapty/index.js';

export default class ProductsMonthlyPlanSet extends AdaptyCommand {
    static override summary = 'Create the App Store monthly plan of an annual product, or change its price';

    static override description = [
        'The plan bills an annual App Store subscription monthly with a 12-month commitment. --price-usd is the monthly '
        + 'price: one of the App Store price points, and 12 payments add up to 1x to 1.5x the annual price; '
        + '`products monthly-plan prices` lists the prices that fit.',
        `Creating a plan asks first. ${NO_REMOVAL} There is no command that removes it. When nobody can answer (no `
        + 'terminal, or --json), nothing is sent and it exits 6: show the user that the plan cannot be removed, and re-run '
        + 'with --yes only after the user says yes. A no at the terminal exits 1. Changing the price of an existing plan '
        + 'asks nothing.',
        PLAN_NOTES,
        'The write is sent once and never repeated. If its answer is lost, the result is unknown: the command reads the '
        + 'product back and shows the plan it sees.',
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> products monthly-plan set 660e8400-... --app 550e8400-... --price-usd 5.99',
        '<%= config.bin %> products monthly-plan set 660e8400-... --app 550e8400-... --price-usd 5.99 --yes --json',
    ];

    static override args = { ...productIdArg };

    static override flags = {
        ...appIdFlag,
        ...yesFlag,
        'price-usd': amountFlag({ description: 'Monthly price in USD, one of the App Store price points', required: true }),
    };

    async run(): Promise<MonthlyPlan> {
        const { args, flags } = await this.parse(ProductsMonthlyPlanSet);
        const input = { priceUsd: flags['price-usd'] };

        assertValid(validateSetMonthlyPlan(input));

        const { products } = this.adapty;
        const product = await products.get(flags.app, args.product_id);

        if (!knowsMonthlyPlan(product)) {
            throw notSupportedError();
        }

        // Only a create cannot be undone: a change of the price of an existing plan asks nothing
        if (product.app_store_monthly_plan === null) {
            const effect = `This creates a monthly plan of $${input.priceUsd.toFixed(2)} a month for product `
                + `"${product.title}" (${product.id}). ${NO_REMOVAL}`;

            await confirmAction({
                effect: canAsk({ interactive: this.interactive }) ? effect : `${effect} ${ASK_FOR_YES}`,
                interactive: this.interactive,
                signal: this.signal,
                yes: flags.yes,
            });
        }

        const plan = await products.setMonthlyPlan(flags.app, args.product_id, input).catch(async (error: unknown) => {
            throw isLostAnswer(error)
                ? withUnknownResult(error, `Do not repeat it blindly. ${await this.readBack(flags.app, args.product_id)}`)
                : withNotSupported(error);
        });

        this.render(plan, saved => `Monthly plan: ${planText(saved)} (vendor product ${saved.vendor_product_id})`);

        return plan;
    }

    /** What a read after a lost answer sees: the state at that moment, not proof of which write went through. */
    private async readBack(appId: string, productId: string): Promise<string> {
        try {
            const product = await this.adapty.products.get(appId, productId);

            return `A read of the product after it shows: Monthly plan: ${monthlyPlanText(product)}.`;
        } catch {
            return `The product could not be read after it either: run \`adapty products get ${productId} --app ${appId}\`.`;
        }
    }
}
