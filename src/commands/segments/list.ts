import { Command } from '@oclif/core';

import { appIdFlag } from '../../cli/flags.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { SegmentDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class SegmentsList extends Command {
    static override description = 'List segments for an app';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> segments list --app 550e8400-...'];
    static override flags = {
        ...appIdFlag,
        ...paginationFlags,
    };

    async run(): Promise<PaginatedResponse<SegmentDTO>> {
        const { flags } = await this.parse(SegmentsList);
        const client = await createAuthenticatedClient(this.config);

        const result = await client.get<PaginatedResponse<SegmentDTO>>(
            `/apps/${flags.app}/segments`,
            paginationParams(flags),
        );

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
