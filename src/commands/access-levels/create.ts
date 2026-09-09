import { Command, Flags } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { AccessLevelCreateRequestDTO, AccessLevelDTO } from '../../lib/api-schemas.js';

export default class AccessLevelsCreate extends Command {
    static override description = 'Create a custom access level';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> access-levels create --app 550e8400-... --sdk-id vip --title "VIP Access"',
    ];

    static override flags = {
        ...appFlag,
        'sdk-id': Flags.string({ description: 'Access level SDK identifier', required: true }),
        'title': Flags.string({ description: 'Access level title', required: true }),
    };

    async run(): Promise<AccessLevelDTO> {
        const { flags } = await this.parse(AccessLevelsCreate);
        const client = await createAuthenticatedClient(this.config);

        const body: AccessLevelCreateRequestDTO = {
            sdk_id: flags['sdk-id'],
            title: flags.title,
        };

        const result = await client.post<AccessLevelDTO>(`/apps/${flags.app}/access-levels`, body);

        this.log('Access level created!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
