import { Flags } from '@oclif/core';

import { validateUpdateProduct } from '../../../sdk/adapty/products/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { CliError, exitCode } from '../../errors.js';
import { appIdFlag } from '../../input/app.js';
import { amountFlag, productIdArg } from '../../input/product.js';
import { renderRecord } from '../../views/record.js';

import type { Product, UpdateProductInput } from '../../../sdk/adapty/index.js';

export default class ProductsUpdate extends AdaptyCommand {
    static override summary = 'Update a product (title, access level, USD price)';

    static override description
        = 'Reads the product and writes it back whole: what you leave out keeps its stored value. The USD price can be '
            + 'set once, while the product has none; a set price stays, and --price-usd then exits 4 after saving the other fields.';

    static override examples = [
        '<%= config.bin %> products update --app UUID 550e8400-... --title "Monthly" --access-level-id UUID',
        '<%= config.bin %> products update --app UUID 550e8400-... --price-usd 9.99',
    ];

    static override args = { ...productIdArg };

    static override flags = {
        ...appIdFlag,
        'access-level-id': Flags.string({ description: 'Access level ID (UUID)' }),
        'price-usd': amountFlag({ description: 'USD price, set once: a push to the stores needs it' }),
        'title': Flags.string({ description: 'Product title' }),
    };

    async run(): Promise<Product> {
        const { args, flags } = await this.parse(ProductsUpdate);

        const input: UpdateProductInput = {
            accessLevelId: flags['access-level-id'],
            priceUsd: flags['price-usd'],
            title: flags.title,
        };

        assertValid(validateUpdateProduct(input));

        const product = await this.adapty.products.update(flags.app, args.product_id, input);

        // The server keeps a set price and answers 200 all the same
        if (input.priceUsd !== undefined && product.price_usd !== input.priceUsd) {
            const kept = product.price_usd === null
                ? 'The server did not set the USD price'
                : `The product already has a USD price of ${product.price_usd}`;

            const others = [
                ...(input.title === undefined ? [] : ['title']),
                ...(input.accessLevelId === undefined ? [] : ['access level']),
            ];

            const rest = others.length === 0 ? 'Nothing else was asked for.' : `The ${others.join(' and ')} ${others.length === 1 ? 'was' : 'were'} saved.`;

            throw new CliError(
                `${kept}: --price-usd was not applied. ${rest}`,
                exitCode.api,
                'price_usd_not_applied',
                { json: { saved: others.length > 0 } },
            );
        }

        this.log('Product updated!');
        this.render(product, renderRecord);

        return product;
    }
}
