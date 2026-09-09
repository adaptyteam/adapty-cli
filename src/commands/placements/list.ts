import { Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { PlacementSummaryDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class PlacementsList extends Command {
    static override description = 'List placements for an app';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> placements list --app 550e8400-...'];
    static override flags = {
        ...appFlag,
        ...paginationFlags,
    };

    async run(): Promise<PaginatedResponse<PlacementSummaryDTO>> {
        const { flags } = await this.parse(PlacementsList);
        const client = await createAuthenticatedClient(this.config);

        const result = await client.get<PaginatedResponse<PlacementSummaryDTO>>(
            `/apps/${flags.app}/placements`,
            paginationParams(flags),
        );

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
