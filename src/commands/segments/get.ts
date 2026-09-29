import { Args, Command } from '@oclif/core';

import { appIdFlag } from '../../cli/flags.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { isValidUuid } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { SegmentDTO } from '../../lib/api-schemas.js';

export default class SegmentsGet extends Command {
    static override args = {
        segment_id: Args.string({ description: 'Segment ID (UUID)', required: true }),
    };

    static override description = 'Get segment details';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> segments get --app UUID 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = {
        ...appIdFlag,
    };

    async run(): Promise<SegmentDTO> {
        const { args, flags } = await this.parse(SegmentsGet);

        if (!isValidUuid(args.segment_id)) {
            this.error('Invalid segment ID format.', { exit: 2 });
        }

        const client = await createAuthenticatedClient(this.config);
        const result = await client.get<SegmentDTO>(`/apps/${flags.app}/segments/${args.segment_id}`);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
