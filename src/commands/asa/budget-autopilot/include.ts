import { Args, Command } from '@oclif/core';

import { asaWrite, createAsaClient, noteReplay } from '../../../lib/asa-client.js';
import { idempotencyFlags } from '../../../lib/asa-flags.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { isValidUuid } from '../../../lib/flags.js';

import type { AsaBudgetAutopilotIncludedDTO } from '../../../lib/asa-schemas.js';

export default class AsaBudgetAutopilotInclude extends Command {
    static override args = {
        campaign_id: Args.string({
            description: 'Campaign ID (UUID, the internal_id printed by asa campaigns list)',
            required: true,
        }),
    };

    static override description
        = 'Return an excluded campaign to the budget autopilot; the next weekly run decides whether it is managed again';

    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa budget-autopilot include UUID'];

    static override flags = {
        ...confirmFlags,
        ...idempotencyFlags,
    };

    async run(): Promise<AsaBudgetAutopilotIncludedDTO> {
        const { args, flags } = await this.parse(AsaBudgetAutopilotInclude);

        if (!isValidUuid(args.campaign_id)) {
            this.error('Invalid campaign ID format. Run `adapty asa campaigns list` to find it.', { exit: 2 });
        }

        await confirmMutation(
            this,
            {
                method: 'POST',
                path: `/budget-autopilot/campaigns/${args.campaign_id}/include/`,
                summary:
                    'Return the campaign to the budget autopilot: the next weekly run decides whether it is managed again, starting from its current budget',
            },
            flags.yes,
        );

        const client = await createAsaClient(this);

        const { replayed } = await asaWrite<undefined>(
            client,
            'post',
            `/budget-autopilot/campaigns/${args.campaign_id}/include`,
            { idempotencyKey: flags['idempotency-key'] },
        );

        noteReplay(replayed, this.log.bind(this));
        this.log('Exclusion lifted. The next weekly run decides whether the campaign is managed again.');

        return { campaign_id: args.campaign_id, included: true };
    }
}
