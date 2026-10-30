import { Flags } from '@oclif/core';

import { productStores } from '../../../sdk/adapty/index.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { pageParams, paginationFlags } from '../../input/pagination.js';
import { renderPage } from '../../views/list.js';

import type { Paginated, ProductGroup } from '../../../sdk/adapty/index.js';

export default class ProductGroupsList extends AdaptyCommand {
    static override description = 'List the App Store subscription groups, or the Google Play subscriptions, of an app';

    static override examples = [
        '<%= config.bin %> product-groups list --app 550e8400-... --store app_store',
        '<%= config.bin %> product-groups list --app 550e8400-... --store play_store --page 2 --page-size 50',
    ];

    static override flags = {
        ...appIdFlag,
        ...paginationFlags,
        store: Flags.option({ description: 'Store to list', options: productStores, required: true })(),
    };

    async run(): Promise<Paginated<ProductGroup>> {
        const { flags } = await this.parse(ProductGroupsList);
        const page = await this.adapty.productGroups.list(flags.app, flags.store, pageParams(flags));

        this.render(page, renderPage);

        return page;
    }
}
