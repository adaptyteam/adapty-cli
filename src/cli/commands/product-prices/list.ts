import { Flags } from '@oclif/core';

import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { productFlag } from '../../input/product.js';
import { renderPriceRows, renderPricesCsv } from '../../views/product-prices.js';

import type { Paginated, PriceRow } from '../../../sdk/adapty/index.js';

export default class ProductPricesList extends AdaptyCommand {
    static override description = 'List the prices of a product by country, with the status of the store sync '
        + '(all on one page). The CSV has the columns of the dashboard price download and goes into `product-prices set --file`';

    static override examples = [
        '<%= config.bin %> product-prices list --app 550e8400-... --product 660e8400-...',
        '<%= config.bin %> product-prices list --app 550e8400-... --product 660e8400-... --csv > prices.csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...productFlag,
        csv: Flags.boolean({
            description: 'Print the columns of the dashboard price download; an empty status is an empty field',
            exclusive: ['json'],
        }),
    };

    async run(): Promise<Paginated<PriceRow>> {
        const { flags } = await this.parse(ProductPricesList);
        const page = await this.adapty.productPrices.list(flags.app, flags.product);

        if (flags.csv) {
            // Written as it is: the text already ends with the line break of the portal file
            process.stdout.write(renderPricesCsv(page.data));
        } else {
            this.render(page, answer => renderPriceRows(answer.data));
        }

        return page;
    }
}
