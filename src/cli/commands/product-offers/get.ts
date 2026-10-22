import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { offerFlag } from '../../input/uuid.js';
import { renderRecord } from '../../views/record.js';

import type { ProductOffer } from '../../../sdk/adapty/index.js';

export default class ProductOffersGet extends AdaptyCommand {
    static override description = 'Get a product offer';
    static override examples = ['<%= config.bin %> product-offers get --app 550e8400-... --offer 770e8400-...'];
    static override flags = { ...appIdFlag, ...offerFlag };

    async run(): Promise<ProductOffer> {
        const { flags } = await this.parse(ProductOffersGet);
        const offer = await this.adapty.productOffers.get(flags.app, flags.offer);

        this.render(offer, renderRecord);

        return offer;
    }
}
