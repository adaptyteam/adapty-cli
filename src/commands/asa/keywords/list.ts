import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { adGroupScopeFlags, asaPaginationFlags, scopeParams, statusFilter } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaKeywordDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaKeywordsList extends Command {
    static override description = 'List targeting keywords; read numbers with asa metrics';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa keywords list',
        '<%= config.bin %> asa keywords list --ad-group AD_GROUP_UUID --status ACTIVE',
    ];

    static override flags = { ...asaPaginationFlags, ...adGroupScopeFlags, ...statusFilter(['ACTIVE', 'PAUSED']) };

    async run(): Promise<PaginatedResponse<AsaKeywordDTO>> {
        const { flags } = await this.parse(AsaKeywordsList);
        const client = await createAsaClient(this);

        const result = await client.get<PaginatedResponse<AsaKeywordDTO>>('/keywords', {
            ...paginationParams(flags),
            ...scopeParams(flags),
        });

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
