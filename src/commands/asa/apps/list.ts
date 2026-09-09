import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaAppDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaAppsList extends Command {
    static override description = 'List the apps promoted by this company in Apple Search Ads';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa apps list', '<%= config.bin %> asa apps list --page 2 --page-size 50'];
    static override flags = { ...asaPaginationFlags };

    async run(): Promise<PaginatedResponse<AsaAppDTO>> {
        const { flags } = await this.parse(AsaAppsList);
        const client = await createAsaClient(this.config);
        const result = await client.get<PaginatedResponse<AsaAppDTO>>('/apps', paginationParams(flags));

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
