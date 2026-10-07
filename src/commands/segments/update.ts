import { Args, Command } from '@oclif/core';

import { appIdFlag } from '../../cli/input/app.js';
import { segmentFilters, segmentWriteFlags } from '../../lib/asa-flags.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { isValidUuid } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { SegmentDetailDTO, SegmentWriteRequestDTO } from '../../lib/api-schemas.js';

export default class SegmentsUpdate extends Command {
    static override args = {
        segment_id: Args.string({ description: 'Segment ID (UUID)', required: true }),
    };

    static override description = `Replace a segment's title, description and filters

The server takes the whole segment, as the dashboard sends it: pass every filter you want to keep, not only
the changed one. Read the current ones with \`segments get\`.`;

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> segments update --app UUID 550e8400-e29b-41d4-a716-446655440000 --title "[ASA] Campaign: Brand" --filter campaign:IN:2144520245',
    ];

    static override flags = { ...appIdFlag, ...segmentWriteFlags };

    async run(): Promise<SegmentDetailDTO> {
        const { args, flags } = await this.parse(SegmentsUpdate);

        if (!isValidUuid(args.segment_id)) {
            this.error('Invalid segment ID format.', { exit: 2 });
        }

        const body: SegmentWriteRequestDTO = {
            description: flags.description,
            filters: segmentFilters(flags),
            title: flags.title,
        };

        const client = await createAuthenticatedClient(this.config);
        const result = await client.put<SegmentDetailDTO>(`/apps/${flags.app}/segments/${args.segment_id}`, body);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
