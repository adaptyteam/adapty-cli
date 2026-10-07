import { Args, Command, Flags } from '@oclif/core';

import { appIdFlag } from '../../../cli/input/app.js';
import { createAsaClient, fetchAsaSegmentEntities } from '../../../lib/asa-client.js';
import { ASA_SEGMENT_FIELD, asaSegmentSourceFlags, resolveAsaSegmentSource } from '../../../lib/asa-flags.js';
import { createAuthenticatedClient } from '../../../lib/client-from-config.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { SegmentDetailDTO, SegmentWriteRequestDTO } from '../../../lib/api-schemas.js';

export default class AsaSegmentsUpdate extends Command {
    static override args = {
        segment_id: Args.string({ description: 'Segment ID (UUID)', required: true }),
    };

    static override description = `Point an existing segment at other Apple Search Ads campaigns, ad groups or keywords

Replaces the segment's filter with one attribution filter over the chosen entities, as the dashboard does.
Title and description stay as stored unless --title / --description are passed.`;

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa segments update SEGMENT_UUID --app APP_UUID --campaign CAMPAIGN_UUID --campaign OTHER_UUID',
        '<%= config.bin %> asa segments update SEGMENT_UUID --app APP_UUID --ad-group AD_GROUP_UUID --keyword KEYWORD_UUID --title "Top keywords"',
    ];

    static override flags = {
        ...appIdFlag,
        ...asaSegmentSourceFlags,
        ...confirmFlags,
        description: Flags.string({ description: 'New description; omit to keep the stored one' }),
        title: Flags.string({ description: 'New title; omit to keep the stored one' }),
    };

    async run(): Promise<SegmentDetailDTO> {
        const { args, flags } = await this.parse(AsaSegmentsUpdate);

        if (!isValidUuid(args.segment_id)) {
            this.error('Invalid segment ID format.', { exit: 2 });
        }

        let selection;

        try {
            selection = resolveAsaSegmentSource(flags);
        } catch (error) {
            this.error((error as Error).message, { exit: 2 });
        }

        const asaClient = await createAsaClient(this);
        const entities = await fetchAsaSegmentEntities(asaClient, selection);

        const client = await createAuthenticatedClient(this.config);
        const path = `/apps/${flags.app}/segments/${args.segment_id}`;
        // PUT replaces the whole segment, so the stored title and description are read back unless overridden
        const overridesBoth = flags.title !== undefined && flags.description !== undefined;
        const stored = overridesBoth ? undefined : await client.get<SegmentDetailDTO>(path);

        const body: SegmentWriteRequestDTO = {
            description: flags.description ?? stored?.description ?? undefined,
            filters: [{ field_name: ASA_SEGMENT_FIELD[selection.source], operator: 'IN', value_list: entities.map(entity => entity.id) }],
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stored is read whenever title is missing
            title: flags.title ?? stored!.title,
        };

        await confirmMutation(this, { body, method: 'PUT', path: `${path}/`, summary: `Replace filters of segment ${args.segment_id}` }, flags.yes);

        const result = await client.put<SegmentDetailDTO>(path, body);

        this.log('Segment updated!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
