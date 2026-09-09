import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { adScopeFlags, asaPaginationFlags, scopeParams, statusFilter } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaAdDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaAdsList extends Command {
    static override description = 'List ads; serving_state_reasons explains why an enabled ad is not running';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa ads list',
        '<%= config.bin %> asa ads list --ad-group AD_GROUP_UUID --status ENABLED',
    ];

    static override flags = { ...asaPaginationFlags, ...adScopeFlags, ...statusFilter(['ENABLED', 'PAUSED']) };

    async run(): Promise<PaginatedResponse<AsaAdDTO>> {
        const { flags } = await this.parse(AsaAdsList);
        const client = await createAsaClient(this.config);

        const result = await client.get<PaginatedResponse<AsaAdDTO>>('/ads', {
            ...paginationParams(flags),
            ...scopeParams(flags),
        });

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
