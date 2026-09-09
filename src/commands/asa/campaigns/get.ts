import { Args, Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaCampaignDTO } from '../../../lib/asa-schemas.js';

export default class AsaCampaignsGet extends Command {
    static override args = {
        campaign_id: Args.string({ description: 'Campaign ID (UUID)', required: true }),
    };

    static override description = 'Show one campaign; read numbers with asa metrics';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa campaigns get 550e8400-e29b-41d4-a716-446655440000'];

    async run(): Promise<AsaCampaignDTO> {
        const { args } = await this.parse(AsaCampaignsGet);

        if (!isValidUuid(args.campaign_id)) {
            this.error('Invalid campaign ID format.', { exit: 2 });
        }

        const client = await createAsaClient(this);
        const result = await client.get<AsaCampaignDTO>(`/campaigns/${args.campaign_id}`);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
