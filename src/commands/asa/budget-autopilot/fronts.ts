import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaBudgetAutopilotFrontsDTO } from '../../../lib/asa-schemas.js';

export default class AsaBudgetAutopilotFronts extends Command {
    static override description
        = 'List the campaigns the budget autopilot manages or has excluded, with budgets, pending changes and exclusions';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa budget-autopilot fronts',
        '<%= config.bin %> asa budget-autopilot fronts --campaign-group UUID --adam-id 1668337467',
    ];

    static override flags = {
        'adam-id': Flags.integer({ description: 'Keep only campaigns of this Apple App Store ID (adam_id), from `asa apps list`' }),
        'campaign-group': Flags.string({ description: 'Keep only campaigns of this organization (UUID from asa orgs list)' }),
    };

    async run(): Promise<AsaBudgetAutopilotFrontsDTO> {
        const { flags } = await this.parse(AsaBudgetAutopilotFronts);

        if (flags['campaign-group'] !== undefined && !isValidUuid(flags['campaign-group'])) {
            this.error('Invalid campaign group ID format. Run `adapty asa orgs list` to find it.', { exit: 2 });
        }

        const client = await createAsaClient(this);

        const result = await client.get<AsaBudgetAutopilotFrontsDTO>('/budget-autopilot/fronts', {
            adam_id: flags['adam-id'] === undefined ? undefined : String(flags['adam-id']),
            campaign_group_id: flags['campaign-group'],
        });

        if (result.items.length === 0) {
            this.log('No campaigns are managed by the budget autopilot yet.');
        } else {
            printList(result.items, this.log.bind(this));
        }

        return result;
    }
}
