import { Flags } from '@oclif/core';

import { productPeriods } from '../../../sdk/adapty/index.js';
import { validateCreateProduct } from '../../../sdk/adapty/products/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { amountFlag } from '../../input/product.js';
import { renderRecord } from '../../views/record.js';

import type { CreateProductInput, Product } from '../../../sdk/adapty/index.js';

export default class ProductsCreate extends AdaptyCommand {
    static override summary = 'Create a product';

    static override description
        = 'A product with no store binding is created in Adapty only and gets its store product from `products push`. '
            + 'A store binding means the product already exists in that store.';

    static override examples = [
        '<%= config.bin %> products create --app UUID --title "Monthly" --access-level-id UUID --period monthly --price-usd 9.99',
        '<%= config.bin %> products create --app UUID --title "Monthly" --access-level-id UUID --period monthly --ios-product-id com.example.monthly',
    ];

    static override flags = {
        ...appIdFlag,
        'title': Flags.string({ description: 'Product title', required: true }),
        'period': Flags.option({ description: 'Subscription period', options: productPeriods, required: true })(),
        'access-level-id': Flags.string({ description: 'Access level ID (UUID)', required: true }),
        'price-usd': amountFlag({ description: 'USD price; a push to the stores needs it' }),
        'ios-product-id': Flags.string({ description: 'iOS product ID', helpGroup: 'STORE BINDINGS' }),
        'android-product-id': Flags.string({ description: 'Android product ID', helpGroup: 'STORE BINDINGS' }),
        'android-base-plan-id': Flags.string({ description: 'Android base plan ID', helpGroup: 'STORE BINDINGS' }),
        'stripe-product-id': Flags.string({ description: 'Stripe product ID (requires --stripe-price-id)', helpGroup: 'STORE BINDINGS' }),
        'stripe-price-id': Flags.string({ description: 'Stripe price ID (requires --stripe-product-id)', helpGroup: 'STORE BINDINGS' }),
        'paddle-product-id': Flags.string({ description: 'Paddle product ID (requires --paddle-price-id)', helpGroup: 'STORE BINDINGS' }),
        'paddle-price-id': Flags.string({ description: 'Paddle price ID (requires --paddle-product-id)', helpGroup: 'STORE BINDINGS' }),
    };

    async run(): Promise<Product> {
        const { flags } = await this.parse(ProductsCreate);

        const input: CreateProductInput = {
            accessLevelId: flags['access-level-id'],
            androidBasePlanId: flags['android-base-plan-id'],
            androidProductId: flags['android-product-id'],
            iosProductId: flags['ios-product-id'],
            paddlePriceId: flags['paddle-price-id'],
            paddleProductId: flags['paddle-product-id'],
            period: flags.period,
            priceUsd: flags['price-usd'],
            stripePriceId: flags['stripe-price-id'],
            stripeProductId: flags['stripe-product-id'],
            title: flags.title,
        };

        assertValid(validateCreateProduct(input));

        const product = await this.adapty.products.create(flags.app, input);

        this.log('Product created!');
        this.render(product, renderRecord);

        return product;
    }
}
