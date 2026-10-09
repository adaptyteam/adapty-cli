import { Args, Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaChangeHistoryDetailDTO } from '../../../lib/asa-schemas.js';

const DETAIL_ID_REGEX = /^[A-Za-z]+\.[\w-]+\.[\w-]+$/;

export default class AsaChangeHistoryGet extends Command {
    static override args = {
        detail_id: Args.string({
            description: 'Detail ID from asa change-history list (EntityType.entityId.txnId)',
            required: true,
        }),
    };

    static override description = 'Field-level before/after of one change (proxied from the Apple Ads Platform API)';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa change-history get Campaign.444555666.TXN_ID --campaign-group <uuid>'];

    static override flags = {
        'campaign-group': Flags.string({
            description: 'Organization the change belongs to (UUID; take campaign_group_id from the list row)',
            required: true,
        }),
    };

    async run(): Promise<AsaChangeHistoryDetailDTO> {
        const { args, flags } = await this.parse(AsaChangeHistoryGet);

        if (!DETAIL_ID_REGEX.test(args.detail_id)) {
            this.error('Invalid detail ID format. Take it from `adapty asa change-history list` (EntityType.entityId.txnId).', {
                exit: 2,
            });
        }

        if (!isValidUuid(flags['campaign-group'])) {
            this.error('Invalid campaign group ID format. Run `adapty asa orgs list` to find it.', { exit: 2 });
        }

        const client = await createAsaClient(this);

        const result = await client.get<AsaChangeHistoryDetailDTO>(`/change-history/${args.detail_id}`, {
            campaign_group_id: flags['campaign-group'],
        });

        printResponse(result, this.log.bind(this));

        return result;
    }
}
