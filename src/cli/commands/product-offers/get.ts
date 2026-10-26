import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { offerIdArg } from '../../input/offer.js';
import { renderRecord } from '../../views/record.js';

import type { ProductOffer } from '../../../sdk/adapty/index.js';

export default class ProductOffersGet extends AdaptyCommand {
    static override description = 'Get a product offer';
    static override examples = ['<%= config.bin %> product-offers get 770e8400-... --app 550e8400-...'];
    static override args = { ...offerIdArg };
    static override flags = { ...appIdFlag };

    async run(): Promise<ProductOffer> {
        const { args, flags } = await this.parse(ProductOffersGet);
        const offer = await this.adapty.productOffers.get(flags.app, args.offer_id);

        this.render(offer, renderRecord);

        return offer;
    }
}
