import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags, assetScopeFlags, scopeParams } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaProductPageDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaProductPagesList extends Command {
    static override description = 'List custom product pages (read-only; authoring stays in App Store Connect)';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa product-pages list',
        '<%= config.bin %> asa product-pages list --app APP_UUID',
    ];

    static override flags = { ...asaPaginationFlags, ...assetScopeFlags };

    async run(): Promise<PaginatedResponse<AsaProductPageDTO>> {
        const { flags } = await this.parse(AsaProductPagesList);
        const client = await createAsaClient(this.config);

        const result = await client.get<PaginatedResponse<AsaProductPageDTO>>('/product-pages', {
            ...paginationParams(flags),
            ...scopeParams(flags),
        });

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
