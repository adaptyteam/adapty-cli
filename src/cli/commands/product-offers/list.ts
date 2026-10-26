import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { productFlag } from '../../input/product.js';
import { renderPage } from '../../views/list.js';

import type { Paginated, ProductOffer } from '../../../sdk/adapty/index.js';

export default class ProductOffersList extends AdaptyCommand {
    static override description = 'List the offers of a product (all on one page)';

    static override examples = ['<%= config.bin %> product-offers list --app 550e8400-... --product 660e8400-...'];
    static override flags = { ...appIdFlag, ...productFlag };

    async run(): Promise<Paginated<ProductOffer>> {
        const { flags } = await this.parse(ProductOffersList);
        const page = await this.adapty.productOffers.list(flags.app, flags.product);

        this.render(page, renderPage);

        return page;
    }
}
