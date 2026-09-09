import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags, orgScopeFlags, scopeParams, statusFilter } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaCampaignDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaCampaignsList extends Command {
    static override description = 'List Apple Search Ads campaigns; read numbers with asa metrics';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa campaigns list',
        '<%= config.bin %> asa campaigns list --app APP_UUID --status PAUSED',
    ];

    static override flags = { ...asaPaginationFlags, ...orgScopeFlags, ...statusFilter(['ENABLED', 'PAUSED']) };

    async run(): Promise<PaginatedResponse<AsaCampaignDTO>> {
        const { flags } = await this.parse(AsaCampaignsList);
        const client = await createAsaClient(this);

        const result = await client.get<PaginatedResponse<AsaCampaignDTO>>('/campaigns', {
            ...paginationParams(flags),
            ...scopeParams(flags),
        });

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
