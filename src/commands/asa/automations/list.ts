import { Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags } from '../../../lib/asa-flags.js';
import { paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaAutomationDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

export default class AsaAutomationsList extends Command {
    static override description = 'List automation rules; status 1 is active, 0 is stopped';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa automations list'];
    static override flags = { ...asaPaginationFlags };

    async run(): Promise<PaginatedResponse<AsaAutomationDTO>> {
        const { flags } = await this.parse(AsaAutomationsList);
        const client = await createAsaClient(this);
        const result = await client.get<PaginatedResponse<AsaAutomationDTO>>('/automations', paginationParams(flags));

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
