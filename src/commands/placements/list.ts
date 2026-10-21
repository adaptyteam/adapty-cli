import { Command, Flags } from '@oclif/core';

import { appIdFlag } from '../../cli/input/app.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { PlacementSummaryDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class PlacementsList extends Command {
    static override description = 'List placements for an app';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> placements list --app 550e8400-...',
        '<%= config.bin %> placements list --app 550e8400-... --type flow',
    ];

    static override flags = {
        ...appIdFlag,
        ...paginationFlags,
        // The server owns the list of types and answers a wrong one with a 400 that names them
        type: Flags.string({ description: 'Only placements of this type: paywall, flow or onboarding' }),
    };

    async run(): Promise<PaginatedResponse<PlacementSummaryDTO>> {
        const { flags } = await this.parse(PlacementsList);
        const client = await createAuthenticatedClient(this.config);

        const result = await client.get<PaginatedResponse<PlacementSummaryDTO>>(
            `/apps/${flags.app}/placements`,
            { ...paginationParams(flags), 'filter[placement_type]': flags.type },
        );

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
