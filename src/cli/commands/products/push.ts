import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { Flags } from '@oclif/core';

import { productStores } from '../../../sdk/adapty/index.js';
import { validatePushProduct } from '../../../sdk/adapty/products/index.js';
import { ValidationError } from '../../../sdk/core/errors.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { productIdArg } from '../../input/product.js';

import type { Product, PushProductInput } from '../../../sdk/adapty/index.js';

const SCREENSHOT_TYPES: Record<string, string> = {
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
};

const invalid = (message: string): never => {
    throw new ValidationError([{ message, path: 'screenshot' }]);
};

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const readBytes = async (path: string): Promise<Buffer> => {
    try {
        return await readFile(path);
    } catch (error) {
        return invalid(`cannot be read: ${reason(error)}`);
    }
};

/** The server takes the image as a data URI; the type comes from the extension, the server checks the content. */
const readScreenshot = async (path: string): Promise<string> => {
    const type = SCREENSHOT_TYPES[extname(path).toLowerCase()];

    if (type === undefined) {
        return invalid(`must be a .png, .jpg or .jpeg file, got "${path}"`);
    }

    const bytes = await readBytes(path);

    if (bytes.length === 0) {
        return invalid(`is an empty file: "${path}"`);
    }

    return `data:${type};base64,${bytes.toString('base64')}`;
};

export default class ProductsPush extends AdaptyCommand {
    static override args = { ...productIdArg };

    static override description
        = 'Push an existing product to App Store Connect or Google Play: it creates the store product in the real store '
            + 'account. The product needs a USD price (`--price-usd` of `products create` or `products update`) and the store credentials of the '
            + 'app. The push is synchronous. App Store errors after Apple has created the product are not reported: '
            + 'read `products get` and look at store_status. It asks first.';

    static override examples = [
        '<%= config.bin %> products push 660e8400-... --app 550e8400-... --store app_store --store-product-id premium_monthly --group-id 1234 --screenshot review.png',
        '<%= config.bin %> products push 660e8400-... --app 550e8400-... --store play_store --store-product-id premium --android-base-plan-id monthly --yes',
    ];

    static override flags = {
        ...appIdFlag,
        ...yesFlag,
        'android-base-plan-id': Flags.string({ description: 'Google Play base plan ID (subscriptions only)', helpGroup: 'GOOGLE PLAY' }),
        'group-id': Flags.string({ description: 'Subscription group ID, see `product-groups list` (subscriptions only)', helpGroup: 'APP STORE' }),
        'screenshot': Flags.string({ description: 'Review screenshot, required for the App Store push: a PNG or JPEG file of an App Store device size', helpGroup: 'APP STORE' }),
        'store': Flags.option({ description: 'Store to push to', options: productStores, required: true })(),
        'store-product-id': Flags.string({ description: 'Product ID in the store', required: true }),
    };

    async run(): Promise<Product> {
        const { args, flags } = await this.parse(ProductsPush);

        const flagInput: PushProductInput = {
            groupId: flags['group-id'],
            androidBasePlanId: flags['android-base-plan-id'],
            screenshot: flags.screenshot,
            store: flags.store,
            storeProductId: flags['store-product-id'],
        };

        // Checked with the path in place of the image, so a screenshot for Google Play is refused unread
        assertValid(validatePushProduct(flagInput));

        const input: PushProductInput = {
            ...flagInput,
            screenshot: flags.screenshot === undefined ? undefined : await readScreenshot(flags.screenshot),
        };

        await confirmAction({
            effect: `Pushes product ${args.product_id} to ${flags.store} as "${flags['store-product-id']}": `
                + 'it creates the product in the real store account.',
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const product = await this.adapty.products.push(flags.app, args.product_id, input);

        this.log(`Pushed to ${flags.store}. Store status: ${product.vendor_products[flags.store]?.store_status ?? 'unknown'}`);

        return product;
    }
}
