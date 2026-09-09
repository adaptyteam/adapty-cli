import { Args, Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, isValidUuid } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { PlacementDetailDTO } from '../../lib/api-schemas.js';

export default class PlacementsGet extends Command {
    static override args = {
        placement_id: Args.string({ description: 'Placement ID (UUID)', required: true }),
    };

    static override description = 'Get placement details';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> placements get --app UUID 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = {
        ...appFlag,
    };

    async run(): Promise<PlacementDetailDTO> {
        const { args, flags } = await this.parse(PlacementsGet);

        if (!isValidUuid(args.placement_id)) {
            this.error('Invalid placement ID format.', { exit: 2 });
        }

        const client = await createAuthenticatedClient(this.config);
        const result = await client.get<PlacementDetailDTO>(`/apps/${flags.app}/placements/${args.placement_id}`);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
