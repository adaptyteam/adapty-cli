import { Command, Flags } from '@oclif/core';

import { appIdFlag } from '../../../cli/input/app.js';
import { createAsaClient, fetchAsaSegmentEntities } from '../../../lib/asa-client.js';
import { ASA_SEGMENT_FIELD, asaSegmentSourceFlags, buildAsaSegmentNaming, resolveAsaSegmentSource } from '../../../lib/asa-flags.js';
import { createAuthenticatedClient } from '../../../lib/client-from-config.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { printResponse } from '../../../lib/output.js';

import type { SegmentDetailDTO, SegmentWriteRequestDTO } from '../../../lib/api-schemas.js';

export default class AsaSegmentsCreate extends Command {
    static override description = `Create an Adapty segment from Apple Search Ads campaigns, ad groups or keywords

Builds the same segment the Ads Manager "create segment" button does: one attribution filter over the Apple ids
of the chosen entities, named "[ASA] Campaign: <name>" unless --title is passed. Pass one kind of entity per call;
--keyword needs exactly one --ad-group to look the keywords up in. --app is the Adapty app the segment belongs to
(see \`adapty apps list\`).`;

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa segments create --app APP_UUID --campaign CAMPAIGN_UUID',
        '<%= config.bin %> asa segments create --app APP_UUID --campaign UUID_1 --campaign UUID_2 --title "[ASA] Brand campaigns"',
        '<%= config.bin %> asa segments create --app APP_UUID --ad-group AD_GROUP_UUID --keyword KEYWORD_UUID',
    ];

    static override flags = {
        ...appIdFlag,
        ...asaSegmentSourceFlags,
        ...confirmFlags,
        description: Flags.string({ description: 'Segment description; defaults to the dashboard wording' }),
        title: Flags.string({ description: 'Segment title; defaults to the dashboard wording, e.g. "[ASA] Campaign: <name>"' }),
    };

    async run(): Promise<SegmentDetailDTO> {
        const { flags } = await this.parse(AsaSegmentsCreate);

        let selection;

        try {
            selection = resolveAsaSegmentSource(flags);
        } catch (error) {
            this.error((error as Error).message, { exit: 2 });
        }

        const asaClient = await createAsaClient(this);
        const entities = await fetchAsaSegmentEntities(asaClient, selection);
        const naming = buildAsaSegmentNaming(selection.source, entities);

        const body: SegmentWriteRequestDTO = {
            description: flags.description ?? naming.description,
            filters: [{ field_name: ASA_SEGMENT_FIELD[selection.source], operator: 'IN', value_list: entities.map(entity => entity.id) }],
            title: flags.title ?? naming.title,
        };

        const path = `/apps/${flags.app}/segments`;

        await confirmMutation(this, { body, method: 'POST', path: `${path}/`, summary: `Create segment ${body.title}` }, flags.yes);

        const client = await createAuthenticatedClient(this.config);
        const result = await client.post<SegmentDetailDTO>(path, body);

        this.log('Segment created!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
