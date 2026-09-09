import { Args, Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, isValidUuid } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { FlowDTO } from '../../lib/api-schemas.js';

export default class FlowsGet extends Command {
    static override args = {
        flow_id: Args.string({ description: 'Flow ID (UUID)', required: true }),
    };

    static override description = 'Get flow details';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> flows get --app UUID 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = {
        ...appFlag,
    };

    async run(): Promise<FlowDTO> {
        const { args, flags } = await this.parse(FlowsGet);

        if (!isValidUuid(args.flow_id)) {
            this.error('Invalid flow ID format.', { exit: 2 });
        }

        const client = await createAuthenticatedClient(this.config);
        const result = await client.get<FlowDTO>(`/apps/${flags.app}/flows/${args.flow_id}`);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
