import { Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { FlowDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class FlowsList extends Command {
    static override description = 'List flows for an app';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> flows list --app 550e8400-...'];
    static override flags = {
        ...appFlag,
        ...paginationFlags,
    };

    async run(): Promise<PaginatedResponse<FlowDTO>> {
        const { flags } = await this.parse(FlowsList);
        const client = await createAuthenticatedClient(this.config);
        const result = await client.get<PaginatedResponse<FlowDTO>>(`/apps/${flags.app}/flows`, paginationParams(flags));

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
