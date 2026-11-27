import { Args, Command } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaKeywordAutopilotCardDTO } from '../../../lib/asa-schemas.js';

export default class AsaKeywordAutopilotGet extends Command {
    static override args = {
        keyword_id: Args.string({
            description: 'Keyword autopilot ID (UUID, the ID printed by asa keyword-autopilot list)',
            required: true,
        }),
    };

    static override description = 'Show one keyword autopilot card: the keyword, its current epoch and its recent decisions';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa keyword-autopilot get 550e8400-e29b-41d4-a716-446655440000'];

    async run(): Promise<AsaKeywordAutopilotCardDTO> {
        const { args } = await this.parse(AsaKeywordAutopilotGet);

        if (!isValidUuid(args.keyword_id)) {
            this.error('Invalid keyword ID format. Run `adapty asa keyword-autopilot list` to find it.', { exit: 2 });
        }

        const client = await createAsaClient(this);
        const result = await client.get<AsaKeywordAutopilotCardDTO>(`/keyword-autopilot/keywords/${args.keyword_id}`);

        const { current_epoch: epoch, keyword, recent_decisions: decisions, ...card } = result;
        const log = this.log.bind(this);

        printResponse({ ...keyword, last_decision: undefined }, log);
        log('');
        printResponse(card, log);

        if (epoch) {
            log('');
            log('Current epoch:');
            printResponse(epoch, log);
        }

        if (decisions.length > 0) {
            log('');
            log('Recent decisions:');

            for (const decision of decisions) {
                log(`  ${decision.occurred_at}  ${decision.text.title}: ${decision.text.decision}`);
            }
        }

        return result;
    }
}
