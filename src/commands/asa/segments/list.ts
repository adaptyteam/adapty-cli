import { Command, Flags } from '@oclif/core';

import { appIdFlag } from '../../../cli/input/app.js';
import { createAsaClient, fetchAsaSegmentEntities } from '../../../lib/asa-client.js';
import { ASA_SEGMENT_FIELD, resolveAsaSegmentSource } from '../../../lib/asa-flags.js';
import { createAuthenticatedClient } from '../../../lib/client-from-config.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { SegmentDetailDTO, SegmentDTO } from '../../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

const ASA_TITLE_PREFIX = '[ASA]';

const parseId = (input: string): Promise<string> => (isValidUuid(input)
    ? Promise.resolve(input)
    : Promise.reject(new Error('Ids are the UUIDs printed by the matching list command.')));

export default class AsaSegmentsList extends Command {
    static override description = `List the segments created from Apple Search Ads entities

Segments whose title starts with "[ASA]", the dashboard's own marker. With --campaign or --ad-group only the
segments whose filter carries that entity's Apple id are kept, so a script can tell whether a campaign already
has its segment before creating one.`;

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa segments list --app APP_UUID',
        '<%= config.bin %> asa segments list --app APP_UUID --campaign CAMPAIGN_UUID',
    ];

    static override flags = {
        ...appIdFlag,
        'ad-group': Flags.string({ description: 'Keep only segments built from this ad group (UUID)', parse: parseId }),
        'campaign': Flags.string({ description: 'Keep only segments built from this campaign (UUID)', parse: parseId }),
    };

    async run(): Promise<SegmentDTO[]> {
        const { flags } = await this.parse(AsaSegmentsList);

        const wanted = await this.wantedFilterValue(flags);
        const client = await createAuthenticatedClient(this.config);
        const page = await client.get<PaginatedResponse<SegmentDTO>>(`/apps/${flags.app}/segments`, { 'page[size]': '100' });
        const asaSegments = page.data.filter(segment => segment.title.startsWith(ASA_TITLE_PREFIX));

        const result = wanted === undefined
            ? asaSegments
            : await this.keepMatching(client, flags.app, asaSegments, wanted);

        printList(result, this.log.bind(this));

        return result;
    }

    /** The Apple id the segments must filter on, resolved from the ASA entity the user named. */
    private async wantedFilterValue(flags: { 'ad-group'?: string | undefined; 'campaign'?: string | undefined }) {
        if (flags.campaign === undefined && flags['ad-group'] === undefined) {
            return undefined;
        }

        if (flags.campaign !== undefined && flags['ad-group'] !== undefined) {
            this.error('Pass either --campaign or --ad-group, not both.', { exit: 2 });
        }

        const selection = resolveAsaSegmentSource({
            'ad-group': flags['ad-group'] === undefined ? undefined : [flags['ad-group']],
            'campaign': flags.campaign === undefined ? undefined : [flags.campaign],
        });

        const [entity] = await fetchAsaSegmentEntities(await createAsaClient(this), selection);

        return { field: ASA_SEGMENT_FIELD[selection.source], value: entity?.id };
    }

    private async keepMatching(
        client: { get<T>(path: string): Promise<T> },
        app: string,
        segments: SegmentDTO[],
        wanted: { field: string; value: string | undefined },
    ): Promise<SegmentDTO[]> {
        const details = await Promise.all(segments.map(segment => client.get<SegmentDetailDTO>(`/apps/${app}/segments/${segment.id}`)));

        return details.filter(detail => detail.filters.some(
            filter => filter.field_name === wanted.field && filter.value_list.map(String).includes(wanted.value ?? ''),
        ));
    }
}
