import { Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { AccessLevelDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class AccessLevelsList extends Command {
    static override description = 'List access levels for an app';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> access-levels list --app 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = {
        ...appFlag,
        ...paginationFlags,
    };

    async run(): Promise<PaginatedResponse<AccessLevelDTO>> {
        const { flags } = await this.parse(AccessLevelsList);
        const client = await createAuthenticatedClient(this.config);

        const result = await client.get<PaginatedResponse<AccessLevelDTO>>(
            `/apps/${flags.app}/access-levels`,
            paginationParams(flags),
        );

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
