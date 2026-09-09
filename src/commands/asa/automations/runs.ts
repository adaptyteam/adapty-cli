import { Args, Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags } from '../../../lib/asa-flags.js';
import { isValidUuid, paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaAutomationRunDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaAutomationsRuns extends Command {
    static override args = {
        automation_id: Args.string({ description: 'Automation rule ID (UUID)', required: true }),
    };

    static override description = 'List past runs of an automation rule, including dry runs';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa automations runs 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = { ...asaPaginationFlags };

    async run(): Promise<PaginatedResponse<AsaAutomationRunDTO>> {
        const { args, flags } = await this.parse(AsaAutomationsRuns);

        if (!isValidUuid(args.automation_id)) {
            this.error('Invalid automation ID format.', { exit: 2 });
        }

        const client = await createAsaClient(this.config);

        const result = await client.get<PaginatedResponse<AsaAutomationRunDTO>>(
            `/automations/${args.automation_id}/runs`,
            paginationParams(flags),
        );

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
