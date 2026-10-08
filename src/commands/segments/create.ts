import { Command } from '@oclif/core';

import { appIdFlag } from '../../cli/input/app.js';
import { segmentFilters, segmentWriteFlags } from '../../lib/asa-flags.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { printResponse } from '../../lib/output.js';

import type { SegmentDetailDTO, SegmentWriteRequestDTO } from '../../lib/api-schemas.js';

export default class SegmentsCreate extends Command {
    static override description = `Create a segment from filters over profile fields

Filters are written as field:OPERATOR:value[,value...] and validated by the server. Apple Search Ads
attribution uses campaign, ad_group and creative (a keyword) with Apple ids as values; build those from
ASA entities with \`asa segments create\` instead of copying ids by hand.`;

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> segments create --app UUID --title "[ASA] Campaign: Brand" --filter campaign:IN:2144520245',
        '<%= config.bin %> segments create --app UUID --title "US installs" --filter ip_country:IN:US --filter install_date:>=:2026-01-01',
    ];

    static override flags = { ...appIdFlag, ...segmentWriteFlags };

    async run(): Promise<SegmentDetailDTO> {
        const { flags } = await this.parse(SegmentsCreate);

        const body: SegmentWriteRequestDTO = {
            description: flags.description,
            filters: segmentFilters(flags),
            title: flags.title,
        };

        const client = await createAuthenticatedClient(this.config);
        const result = await client.post<SegmentDetailDTO>(`/apps/${flags.app}/segments`, body);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
