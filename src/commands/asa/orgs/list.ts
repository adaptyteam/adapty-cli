import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaCampaignGroupDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaOrgsList extends Command {
    static override description = 'List the Apple Search Ads organizations this company can spend from';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa orgs list'];
    static override flags = { ...asaPaginationFlags };

    async run(): Promise<PaginatedResponse<AsaCampaignGroupDTO>> {
        const { flags } = await this.parse(AsaOrgsList);
        const client = await createAsaClient(this.config);
        const result = await client.get<PaginatedResponse<AsaCampaignGroupDTO>>('/campaign-groups', paginationParams(flags));

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
