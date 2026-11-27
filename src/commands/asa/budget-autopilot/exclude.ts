import { Args, Command } from '@oclif/core';

import { asaWrite, createAsaClient, noteReplay } from '../../../lib/asa-client.js';
import { idempotencyFlags } from '../../../lib/asa-flags.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaBudgetAutopilotFrontDTO } from '../../../lib/asa-schemas.js';

export default class AsaBudgetAutopilotExclude extends Command {
    static override args = {
        campaign_id: Args.string({
            description: 'Campaign ID (UUID, the internal_id printed by asa campaigns list)',
            required: true,
        }),
    };

    static override description
        = 'Exclude a campaign from the budget autopilot: it stops managing the budget until the campaign is included again';

    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa budget-autopilot exclude UUID'];

    static override flags = {
        ...confirmFlags,
        ...idempotencyFlags,
    };

    async run(): Promise<AsaBudgetAutopilotFrontDTO> {
        const { args, flags } = await this.parse(AsaBudgetAutopilotExclude);

        if (!isValidUuid(args.campaign_id)) {
            this.error('Invalid campaign ID format. Run `adapty asa campaigns list` to find it.', { exit: 2 });
        }

        await confirmMutation(
            this,
            {
                method: 'POST',
                path: `/budget-autopilot/campaigns/${args.campaign_id}/exclusion/`,
                summary:
                    'Exclude the campaign from the budget autopilot: its budget stays as it is, changes already applied are not reverted, and open changes for it are cancelled',
            },
            flags.yes,
        );

        const client = await createAsaClient(this);

        const { replayed, result } = await asaWrite<AsaBudgetAutopilotFrontDTO>(
            client,
            'post',
            `/budget-autopilot/campaigns/${args.campaign_id}/exclusion`,
            { idempotencyKey: flags['idempotency-key'] },
        );

        noteReplay(replayed, this.log.bind(this));

        if (!replayed) {
            this.log('Campaign excluded.');
        }

        printResponse(result, this.log.bind(this));

        return result;
    }
}
