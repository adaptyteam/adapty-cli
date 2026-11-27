import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaBudgetAutopilotStatusDTO } from '../../../lib/asa-schemas.js';

export default class AsaBudgetAutopilotStatus extends Command {
    static override description
        = 'Show the budget autopilot state of the company: mode, last run, managed campaigns, open decisions and spend guard alerts';

    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa budget-autopilot status'];

    async run(): Promise<AsaBudgetAutopilotStatusDTO> {
        await this.parse(AsaBudgetAutopilotStatus);

        const client = await createAsaClient(this);
        const result = await client.get<AsaBudgetAutopilotStatusDTO>('/budget-autopilot/status');

        if (!result.enrolled) {
            this.log('The company is not connected to the budget autopilot.');
        }

        printResponse(result, this.log.bind(this));

        return result;
    }
}
