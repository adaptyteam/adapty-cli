import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { productIdArg, suggestFlags } from '../../../input/retention-messaging.js';
import { renderItems } from '../../../views/retention-messaging.js';

import type { PromoOfferSuggestions } from '../../../../sdk/adapty/retention-messaging/index.js';

export default class RetentionMessagingPromoOffersSuggest extends AdaptyCommand {
    static override summary = 'Suggest App Store promotional offers of a product for a promo retention message';

    static override description = 'Give the store_id of an offer as the association {type: promo_offer, store_id} of the product.';

    static override examples = ['<%= config.bin %> retention-messaging promo-offers suggest PRODUCT_ID --app UUID'];

    static override args = { ...productIdArg };

    static override flags = { ...appIdFlag, ...suggestFlags };

    async run(): Promise<PromoOfferSuggestions> {
        const { args, flags } = await this.parse(RetentionMessagingPromoOffersSuggest);

        const answer = await this.adapty.retentionMessaging.suggest.promoOffers(flags.app, args.product_id, {
            limit: flags.limit,
            search: flags.search,
        });

        this.render(answer, renderItems);

        return answer;
    }
}
