import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags, campaignScopeFlags, scopeParams, statusFilter } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaAdGroupDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaAdGroupsList extends Command {
    static override description = 'List ad groups; read numbers with asa metrics';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa ad-groups list',
        '<%= config.bin %> asa ad-groups list --campaign CAMPAIGN_UUID',
    ];

    static override flags = { ...asaPaginationFlags, ...campaignScopeFlags, ...statusFilter(['ENABLED', 'PAUSED']) };

    async run(): Promise<PaginatedResponse<AsaAdGroupDTO>> {
        const { flags } = await this.parse(AsaAdGroupsList);
        const client = await createAsaClient(this.config);

        const result = await client.get<PaginatedResponse<AsaAdGroupDTO>>('/ad-groups', {
            ...paginationParams(flags),
            ...scopeParams(flags),
        });

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
