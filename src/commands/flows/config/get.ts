import { Args, Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../../lib/client-from-config.js';
import { appFlag, isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { FlowConfigDTO } from '../../../lib/api-schemas.js';

export default class FlowsConfigGet extends Command {
    static override args = {
        flow_id: Args.string({ description: 'Flow ID (UUID)', required: true }),
    };

    static override description
        = 'Read the flow builder config (404 until the config has been written at least once). '
            + 'On a failed publish, `publication_status`, `transform_error` and `publication_error` show why.';

    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> flows config get --app UUID 550e8400-e29b-41d4-a716-446655440000'];
    static override flags = {
        ...appFlag,
    };

    async run(): Promise<FlowConfigDTO> {
        const { args, flags } = await this.parse(FlowsConfigGet);

        if (!isValidUuid(args.flow_id)) {
            this.error('Invalid flow ID format.', { exit: 2 });
        }

        const client = await createAuthenticatedClient(this.config);
        const result = await client.get<FlowConfigDTO>(`/apps/${flags.app}/flows/${args.flow_id}/config`);

        printResponse(result, this.log.bind(this));

        return result;
    }
}
