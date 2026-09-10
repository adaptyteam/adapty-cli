import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { adGroupScopeFlags, asaPaginationFlags, periodFlags, periodParams, scopeParams } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaSearchTermDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaSearchTermsList extends Command {
    static override description = 'List the search terms your ads matched, with their metrics';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa search-terms list --date-from 2026-07-01 --date-to 2026-07-31',
        '<%= config.bin %> asa search-terms list --ad-group AD_GROUP_UUID',
    ];

    static override flags = { ...asaPaginationFlags, ...periodFlags, ...adGroupScopeFlags };

    async run(): Promise<PaginatedResponse<AsaSearchTermDTO>> {
        const { flags } = await this.parse(AsaSearchTermsList);
        const client = await createAsaClient(this);

        const result = await client.get<PaginatedResponse<AsaSearchTermDTO>>('/search-terms', {
            ...paginationParams(flags),
            ...periodParams(flags),
            ...scopeParams(flags),
        });

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
