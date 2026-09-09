import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags, assetScopeFlags, scopeParams } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaCreativeDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaCreativesList extends Command {
    static override description = 'List creatives; creative_id is what `asa ads create` needs';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa creatives list',
        '<%= config.bin %> asa creatives list --app APP_UUID',
    ];

    static override flags = { ...asaPaginationFlags, ...assetScopeFlags };

    async run(): Promise<PaginatedResponse<AsaCreativeDTO>> {
        const { flags } = await this.parse(AsaCreativesList);
        const client = await createAsaClient(this.config);

        const result = await client.get<PaginatedResponse<AsaCreativeDTO>>('/creatives', {
            ...paginationParams(flags),
            ...scopeParams(flags),
        });

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
