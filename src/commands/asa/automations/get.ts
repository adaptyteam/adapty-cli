import { Args, Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaAutomationDTO } from '../../../lib/asa-schemas.js';

export default class AsaAutomationsGet extends Command {
    static override args = {
        automation_id: Args.string({ description: 'Automation rule ID (UUID)', required: true }),
    };

    static override description = 'Show one automation rule with its conditions and actions';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa automations get 550e8400-e29b-41d4-a716-446655440000'];

    async run(): Promise<AsaAutomationDTO> {
        const { args } = await this.parse(AsaAutomationsGet);

        if (!isValidUuid(args.automation_id)) {
            this.error('Invalid automation ID format.', { exit: 2 });
        }

        const client = await createAsaClient(this);
        const result = await client.get<AsaAutomationDTO>(`/automations/${args.automation_id}`);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
