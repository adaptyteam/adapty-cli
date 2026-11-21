import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { pageParams, paginationFlags } from '../../input/pagination.js';
import { renderProductPage } from '../../views/products.js';

import type { Paginated, Product } from '../../../sdk/adapty/index.js';

export default class ProductsList extends AdaptyCommand {
    static override description = 'List products for an app, each with its App Store monthly plan';
    static override examples = ['<%= config.bin %> products list --app 550e8400-...'];
    static override flags = { ...appIdFlag, ...paginationFlags };

    async run(): Promise<Paginated<Product>> {
        const { flags } = await this.parse(ProductsList);
        const page = await this.adapty.products.list(flags.app, pageParams(flags));

        this.render(page, renderProductPage);

        return page;
    }
}
