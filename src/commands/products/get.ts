import { Args, Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, isValidUuid } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { ProductDTO } from '../../lib/api-schemas.js';

export default class ProductsGet extends Command {
    static override args = {
        product_id: Args.string({ description: 'Product ID (UUID)', required: true }),
    };

    static override description = 'Get product details';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> products get --app UUID 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = {
        ...appFlag,
    };

    async run(): Promise<ProductDTO> {
        const { args, flags } = await this.parse(ProductsGet);

        if (!isValidUuid(args.product_id)) {
            this.error('Invalid product ID format.', { exit: 2 });
        }

        const client = await createAuthenticatedClient(this.config);
        const result = await client.get<ProductDTO>(`/apps/${flags.app}/products/${args.product_id}`);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
