import { Command, Flags } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { FlowDTO, FlowWriteRequestDTO } from '../../lib/api-schemas.js';

export default class FlowsCreate extends Command {
    static override description = 'Create a flow (row only — write its config with `flows config update`)';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> flows create --app UUID --name "Onboarding"'];
    static override flags = {
        ...appFlag,
        name: Flags.string({ description: 'Flow name', required: true }),
    };

    async run(): Promise<FlowDTO> {
        const { flags } = await this.parse(FlowsCreate);
        const client = await createAuthenticatedClient(this.config);

        const body: FlowWriteRequestDTO = { name: flags.name };

        const result = await client.post<FlowDTO>(`/apps/${flags.app}/flows`, body);

        this.log('Flow created!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
