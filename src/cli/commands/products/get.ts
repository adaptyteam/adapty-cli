import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { productIdArg } from '../../input/product.js';
import { renderRecord } from '../../views/record.js';

import type { Product } from '../../../sdk/adapty/index.js';

export default class ProductsGet extends AdaptyCommand {
    static override args = { ...productIdArg };
    static override description = 'Get product details: the USD price and the status of each store product';
    static override examples = ['<%= config.bin %> products get --app UUID 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = { ...appIdFlag };

    async run(): Promise<Product> {
        const { args, flags } = await this.parse(ProductsGet);
        const product = await this.adapty.products.get(flags.app, args.product_id);

        this.render(product, renderRecord);

        return product;
    }
}
