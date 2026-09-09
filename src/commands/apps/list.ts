import { Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { AppSummaryDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class AppsList extends Command {
    static override description = 'List Adapty apps';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> apps list', '<%= config.bin %> apps list --page 2 --page-size 10'];
    static override flags = {
        ...paginationFlags,
    };

    async run(): Promise<PaginatedResponse<AppSummaryDTO>> {
        const { flags } = await this.parse(AppsList);
        const client = await createAuthenticatedClient(this.config);
        const result = await client.get<PaginatedResponse<AppSummaryDTO>>('/apps', paginationParams(flags));

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
