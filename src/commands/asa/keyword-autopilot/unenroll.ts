import { Args, Command } from '@oclif/core';

import { asaWrite, createAsaClient, noteReplay } from '../../../lib/asa-client.js';
import { idempotencyFlags } from '../../../lib/asa-flags.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { isValidUuid } from '../../../lib/flags.js';

import type { AsaKeywordAutopilotUnenrolledDTO } from '../../../lib/asa-schemas.js';

export default class AsaKeywordAutopilotUnenroll extends Command {
    static override args = {
        keyword_id: Args.string({
            description: 'Keyword autopilot ID (UUID, the ID printed by asa keyword-autopilot list)',
            required: true,
        }),
    };

    static override description
        = 'Take a keyword off the keyword autopilot; its bid stays as it is and it can be enrolled again';

    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa keyword-autopilot unenroll UUID'];

    static override flags = {
        ...confirmFlags,
        ...idempotencyFlags,
    };

    async run(): Promise<AsaKeywordAutopilotUnenrolledDTO> {
        const { args, flags } = await this.parse(AsaKeywordAutopilotUnenroll);

        if (!isValidUuid(args.keyword_id)) {
            this.error('Invalid keyword ID format. Run `adapty asa keyword-autopilot list` to find it.', { exit: 2 });
        }

        await confirmMutation(
            this,
            {
                method: 'POST',
                path: `/keyword-autopilot/keywords/${args.keyword_id}/unenroll/`,
                summary: 'Take the keyword off the keyword autopilot: its bid stays as it is and the keyword can be enrolled again',
            },
            flags.yes,
        );

        const client = await createAsaClient(this);

        const { replayed } = await asaWrite<undefined>(
            client,
            'post',
            `/keyword-autopilot/keywords/${args.keyword_id}/unenroll`,
            { idempotencyKey: flags['idempotency-key'] },
        );

        noteReplay(replayed, this.log.bind(this));
        this.log('Keyword unenrolled.');

        return { keyword_id: args.keyword_id, unenrolled: true };
    }
}
