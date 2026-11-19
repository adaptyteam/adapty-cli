import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { productIdArg, suggestFlags } from '../../../input/retention-messaging.js';
import { renderItems } from '../../../views/retention-messaging.js';

import type { PlanSwitchSuggestions } from '../../../../sdk/adapty/retention-messaging/index.js';

export default class RetentionMessagingPlanSwitchesSuggest extends AdaptyCommand {
    static override summary = 'Suggest plans to switch to from a product, for a promo retention message';

    static override description = 'Give the store_id of a plan as the association {type: plan_switch, store_id} of the product. '
        + 'It needs the App Store Connect key of the app.';

    static override examples = ['<%= config.bin %> retention-messaging plan-switches suggest PRODUCT_ID --app UUID'];

    static override args = { ...productIdArg };

    static override flags = { ...appIdFlag, ...suggestFlags };

    async run(): Promise<PlanSwitchSuggestions> {
        const { args, flags } = await this.parse(RetentionMessagingPlanSwitchesSuggest);

        const answer = await this.adapty.retentionMessaging.suggest.planSwitches(flags.app, args.product_id, {
            limit: flags.limit,
            search: flags.search,
        });

        this.render(answer, renderItems);

        return answer;
    }
}
