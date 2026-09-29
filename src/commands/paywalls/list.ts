import { Command } from '@oclif/core';

import { appIdFlag } from '../../cli/flags.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { PaywallDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class PaywallsList extends Command {
    static override description = 'List paywalls for an app';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> paywalls list --app 550e8400-...'];
    static override flags = {
        ...appIdFlag,
        ...paginationFlags,
    };

    async run(): Promise<PaginatedResponse<PaywallDTO>> {
        const { flags } = await this.parse(PaywallsList);
        const client = await createAuthenticatedClient(this.config);

        const result = await client.get<PaginatedResponse<PaywallDTO>>(
            `/apps/${flags.app}/paywalls`,
            paginationParams(flags),
        );

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
