import { Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { ProductDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class ProductsList extends Command {
    static override description = 'List products for an app';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> products list --app 550e8400-...'];
    static override flags = {
        ...appFlag,
        ...paginationFlags,
    };

    async run(): Promise<PaginatedResponse<ProductDTO>> {
        const { flags } = await this.parse(ProductsList);
        const client = await createAuthenticatedClient(this.config);

        const result = await client.get<PaginatedResponse<ProductDTO>>(
            `/apps/${flags.app}/products`,
            paginationParams(flags),
        );

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
